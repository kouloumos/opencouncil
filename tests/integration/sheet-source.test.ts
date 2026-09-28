/** @jest-environment node */
jest.mock('@/lib/tasks/generateHighlight', () => ({ handleGenerateHighlightResult: jest.fn() }))
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult } from '@/lib/tasks/pollDecisions'
import { deriveAndPersist, explainMeeting } from '@/lib/derivation'
import { replaceSheetFile, reviewSheetReading, storeFactSourceReading } from '@/lib/db/meetingFactSources'
import type { MeetingFactsReading } from '@/lib/apiTypes'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, createTaskStatus } from '../helpers/factories'
import { makeExtractedDecision, makePollDecisionsResult } from '../helpers/builders'

/**
 * The back office's sheet as a source (issue #807): a confirmed sheet gives a
 * meeting its rows before any page is read, a page read later outranks it and
 * the disagreement is reported, and a new sheet replaces the earlier one whole.
 */
describe('the attendance sheet as a source', () => {
    let cityId: string
    let meetingId: string
    let a: { id: string }
    let b: { id: string }
    let c: { id: string }
    let s: Array<{ id: string }>

    beforeEach(async () => {
        await resetDatabase(prisma)
        cityId = (await createCity({ id: 'c1' })).id
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        meetingId = (await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id })).id
        a = await createPerson(cityId, { name: 'Άννα Αλεξίου' })
        b = await createPerson(cityId, { name: 'Βασίλης Βλάχος' })
        c = await createPerson(cityId, { name: 'Γιώργος Γεωργίου' })
        s = []
        for (const i of [1, 2, 3]) s.push(await createSubject(meetingId, cityId, { name: `Θέμα ${i}`, agendaItemIndex: i }))
    })

    /** The sheet as the reader returns it: a, b present, c absent, c arrives before item 3. */
    const sheetReading = (): MeetingFactsReading => ({
        rollCall: {
            rawText: '', utteranceIds: [],
            entries: [
                { name: 'ΑΛΕΞΙΟΥ ΑΝΝΑ', personId: a.id, status: 'PRESENT', absenceJustified: null, rawText: '1. ΑΛΕΞΙΟΥ ΑΝΝΑ', utteranceId: null, line: 1 },
                { name: 'ΒΛΑΧΟΣ ΒΑΣΙΛΕΙΟΣ', personId: b.id, status: 'PRESENT', absenceJustified: null, rawText: '2. ΒΛΑΧΟΣ ΒΑΣΙΛΕΙΟΣ', utteranceId: null, line: 2 },
                { name: 'ΓΕΩΡΓΙΟΥ ΓΕΩΡΓΙΟΣ', personId: c.id, status: 'ABSENT', absenceJustified: null, rawText: '3. ΓΕΩΡΓΙΟΥ ΓΕΩΡΓΙΟΣ', utteranceId: null, line: 3 },
            ],
        },
        attendanceChanges: [{
            personId: c.id, name: 'ΓΕΩΡΓΙΟΥ ΓΕΩΡΓΙΟΣ', type: 'arrival',
            anchor: { kind: 'agenda_item', agendaItemIndex: 3, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: 'before' },
            rawText: 'προσήλθε στο 3ο θέμα', reportingPdfCount: 1, totalPdfCount: 1, utteranceId: null, line: 3,
        }],
        votes: [],
        presidedBy: null, nameMatches: [], unmatchedNames: [], warnings: [],
    })

    async function uploadAndRead(reading: MeetingFactsReading) {
        await replaceSheetFile(cityId, meetingId, { key: 'attendance-sheets/c1/m1/x.webp', name: 'x.webp', mediaType: 'image/webp' }, null)
        const task = await createTaskStatus(meetingId, cityId, { type: 'readAttendanceSheet', version: 1 })
        await prisma.meetingFactSource.update({ where: { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source: 'sheet' } }, data: { taskId: task.id } })
        await storeFactSourceReading(cityId, meetingId, 'sheet', reading, { taskId: task.id, readerVersion: '1', fileKey: 'attendance-sheets/c1/m1/x.webp' })
    }
    const statusOf = async (personId: string, item: number) =>
        prisma.subjectAttendance.findFirst({ where: { subjectId: s[item - 1].id, personId }, select: { status: true, source: true } })

    test('a read sheet derives nothing until a person confirms it, then gives the meeting its rows', async () => {
        await uploadAndRead(sheetReading())
        const before = await deriveAndPersist(cityId, meetingId)
        expect(before.issues.map(i => i.code)).toContain('SHEET_UNCONFIRMED')
        expect(await statusOf(a.id, 1)).toBeNull()

        await reviewSheetReading(cityId, meetingId, sheetReading(), { confirm: true, userId: null })
        await deriveAndPersist(cityId, meetingId)
        expect(await statusOf(a.id, 1)).toEqual({ status: 'PRESENT', source: 'sheet' })
        expect(await statusOf(c.id, 1)).toEqual({ status: 'ABSENT', source: 'sheet' })
        expect(await statusOf(c.id, 3)).toEqual({ status: 'PRESENT', source: 'sheet' })
        const events = await prisma.attendanceEvent.findMany({ where: { cityId, councilMeetingId: meetingId } })
        expect(events).toEqual([expect.objectContaining({ personId: c.id, kind: 'ARRIVAL', source: 'sheet' })])
    })

    test('a page read later outranks the sheet, and the sheet\'s different word is reported with its line', async () => {
        await uploadAndRead(sheetReading())
        await reviewSheetReading(cityId, meetingId, sheetReading(), { confirm: true, userId: null })
        await deriveAndPersist(cityId, meetingId)

        // The page of item 1 prints c present from the start.
        await prisma.decision.create({ data: { subjectId: s[0].id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions', version: 4 })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({ extractions: { decisions: [makeExtractedDecision({ subjectId: s[0].id, rollCallPresent: [a.id, b.id, c.id] })], warnings: [] } }))

        expect(await statusOf(c.id, 1)).toEqual({ status: 'PRESENT', source: 'decision' })
        const out = await explainMeeting(cityId, meetingId)
        expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({
            code: 'SOURCES_DISAGREE', personId: c.id, params: expect.objectContaining({ kind: 'rollCall', winSource: 'decision', loseSource: 'sheet' }),
        })]))
    })

    test('a new upload replaces the earlier sheet whole: nothing of the first remains', async () => {
        await uploadAndRead(sheetReading())
        await reviewSheetReading(cityId, meetingId, sheetReading(), { confirm: true, userId: null })
        await deriveAndPersist(cityId, meetingId)
        expect(await statusOf(a.id, 1)).toEqual({ status: 'PRESENT', source: 'sheet' })

        await replaceSheetFile(cityId, meetingId, { key: 'attendance-sheets/c1/m1/y.webp', name: 'y.webp', mediaType: 'image/webp' }, null)
        const row = await prisma.meetingFactSource.findUniqueOrThrow({ where: { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source: 'sheet' } } })
        expect(row).toMatchObject({ status: 'uploaded', reading: null, confirmedAt: null })
        const out = await deriveAndPersist(cityId, meetingId)
        expect(out.issues.map(i => i.code)).toContain('NO_ROLL_CALL')
        expect(await statusOf(a.id, 1)).toBeNull() // the write is refused, and the rows of the sheet that is gone go with it
    })
})

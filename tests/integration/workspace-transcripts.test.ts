/** @jest-environment node */

import prisma from '@/lib/db/prisma'
import { deleteTranscript } from '@/lib/db/transcripts'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSpeakerSegment, createSpeakerTag } from '../helpers/factories'

describe('deleteTranscript', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        await prisma.workspace.create({ data: { id: 'ws1', name: 'Workspace' } })
        for (const id of ['t1', 't2']) {
            await prisma.transcript.create({ data: { id, workspaceId: 'ws1', name: id } })
        }
    })

    async function segmentWithTag(transcriptId: string, label: string) {
        const tag = await createSpeakerTag({ label })
        await createSpeakerSegment(transcriptId, 'ws1', { speakerTagId: tag.id })
        return tag
    }

    test('deletes the transcript with its segments and the speaker tags they used', async () => {
        const tag = await segmentWithTag('t1', 'SPEAKER_0')
        const otherTag = await segmentWithTag('t2', 'SPEAKER_0')

        await deleteTranscript('ws1', 't1')

        expect(await prisma.transcript.findMany({ select: { id: true } })).toEqual([{ id: 't2' }])
        expect(await prisma.speakerSegment.count({ where: { meetingId: 't1' } })).toBe(0)
        expect(await prisma.speakerTag.findUnique({ where: { id: tag.id } })).toBeNull()
        expect(await prisma.speakerTag.findUnique({ where: { id: otherTag.id } })).not.toBeNull()
    })

    test('keeps a speaker tag that a segment of another transcript still uses', async () => {
        const shared = await segmentWithTag('t1', 'SPEAKER_0')
        await createSpeakerSegment('t2', 'ws1', { speakerTagId: shared.id })

        await deleteTranscript('ws1', 't1')

        expect(await prisma.speakerTag.findUnique({ where: { id: shared.id } })).not.toBeNull()
    })

    test('refuses the transcript of a council meeting', async () => {
        const city = await createCity({ id: 'c1' })
        await createMeeting(city.id, { id: 'm1' })

        await expect(deleteTranscript('c1', 'm1')).rejects.toThrow('Transcript not found')
        expect(await prisma.councilMeeting.count({ where: { id: 'm1' } })).toBe(1)
    })

    test('refuses an unknown transcript', async () => {
        await expect(deleteTranscript('ws1', 'missing')).rejects.toThrow('Transcript not found')
    })
})

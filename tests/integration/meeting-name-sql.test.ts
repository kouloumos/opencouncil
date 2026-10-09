/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import { CityLanguage, MeetingKind } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { meetingDisplayName } from '@/lib/meetingName'
import { splitSqlStatements } from '../helpers/sql'

// The test database comes from `prisma db push`, which creates no function,
// so the test installs the one that the latest migration defines.
const MIGRATION = path.join(
    __dirname,
    '../../prisma/migrations/20261009120000_meeting_title/migration.sql',
)

const KINDS: Array<MeetingKind | null> = [null, ...Object.values(MeetingKind)]
// Every city language, and English, which has kind words too.
const LANGUAGES = [...Object.values(CityLanguage), 'en']
const NUMBERS = [null, 1, 2, 3, 11, 12, 13, 21, 22, 23, 101]
const TIMEZONES: Record<string, string> = { el: 'Europe/Athens', en: 'Europe/Athens', fr: 'Europe/Paris', sr: 'Europe/Belgrade' }
const DATES = [
    new Date('2026-03-12T16:00:00Z'),
    // Before midnight UTC, after midnight in Athens (summer time).
    new Date('2026-06-25T22:30:00Z'),
    // Before midnight UTC, after midnight in Athens (winter time).
    new Date('2026-01-07T22:15:00Z'),
]

/** The SQL function, which the Notis view calls, and the TypeScript function
 *  must print the same title. Both carry the kind words by hand. */
describe('council_meeting_display_name', () => {
    beforeAll(async () => {
        const [fn] = splitSqlStatements(fs.readFileSync(MIGRATION, 'utf8'))
            .filter((s) => s.includes('CREATE OR REPLACE FUNCTION council_meeting_display_name'))
        await prisma.$executeRawUnsafe(fn)
    })

    async function sqlName(
        { kind, sessionNumber = null, dateTime, override = null, lang = 'el', sessionZone = 'UTC' }:
        { kind: MeetingKind | null; sessionNumber?: number | null; dateTime: Date; override?: string | null; lang?: string; sessionZone?: string },
    ) {
        // The column is a timestamp without zone that holds UTC, which is how
        // Prisma writes it. Pass the same value. The session zone must not
        // change the result, so the test sets one in the same transaction.
        const utc = dateTime.toISOString().replace('T', ' ').replace('Z', '')
        return prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${sessionZone}'`)
            const [row] = await tx.$queryRawUnsafe<Array<{ name: string }>>(
                `SELECT council_meeting_display_name($1, $2::"MeetingKind", $3::integer, $4::timestamp, $5, $6) AS name`,
                override, kind, sessionNumber, utc, TIMEZONES[lang], lang,
            )
            return row.name
        })
    }

    test.each(['UTC', 'America/New_York'])('equals meetingDisplayName for every kind, number, language and date (session zone %s)', async (sessionZone) => {
        for (const lang of LANGUAGES) {
            for (const kind of KINDS) {
                for (const sessionNumber of NUMBERS) {
                    for (const dateTime of DATES) {
                        const expected = meetingDisplayName(
                            { name: null, name_en: null, kind, sessionNumber, dateTime, administrativeBody: null },
                            lang,
                            TIMEZONES[lang],
                        )
                        expect(await sqlName({ kind, sessionNumber, dateTime, lang, sessionZone })).toBe(expected)
                    }
                }
            }
        }
    })

    test('returns the override as it is, and reads an empty override as none', async () => {
        expect(await sqlName({ kind: 'accountability', dateTime: DATES[0], override: 'Κοινή Συνεδρίαση' })).toBe('Κοινή Συνεδρίαση')
        const empty = { name: '', name_en: null, kind: 'accountability' as const, sessionNumber: 4, dateTime: DATES[0], administrativeBody: null }
        expect(await sqlName({ kind: 'accountability', sessionNumber: 4, dateTime: DATES[0], override: '' }))
            .toBe(meetingDisplayName(empty, 'el', 'Europe/Athens'))
    })
})

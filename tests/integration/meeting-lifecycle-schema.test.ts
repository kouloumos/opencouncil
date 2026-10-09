/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { resetDatabase } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import { createAdministrativeBody, createCity, createMeeting } from '../helpers/factories'

const MIGRATION = path.join(
    __dirname,
    '../../prisma/migrations/20261006130000_meeting_lifecycle/migration.sql',
)

/** The test database is built with `prisma db push`, which knows nothing of
 *  the hand-written parts of the migration. Replay those parts: the named
 *  checks, and (on demand) the λογοδοσία kind backfill. */
const MEMORY_CHECK_MIGRATION = path.join(
    __dirname,
    '../../prisma/migrations/20261009150000_postponement_memory_check/migration.sql',
)

function migrationStatements(match: RegExp, migration: string = MIGRATION): string[] {
    const sql = fs.readFileSync(migration, 'utf8')
    return splitSqlStatements(sql)
        .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
        .filter((s) => match.test(s))
}

async function addNamedChecks() {
    for (const statement of [...migrationStatements(/CHECK \(/), ...migrationStatements(/CHECK \(/, MEMORY_CHECK_MIGRATION)]) {
        await prisma.$executeRawUnsafe(statement)
    }
}

async function runKindBackfill() {
    const [update] = migrationStatements(/^UPDATE "CouncilMeeting"/)
    return prisma.$executeRawUnsafe(update)
}

function errorCode(error: unknown): string | undefined {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return (error.meta?.code as string | undefined) ?? error.code
    }
    const message = String((error as Error)?.message ?? error)
    return message.match(/Code: `(\d+)`/)?.[1] ?? message.match(/\b(23\d{3})\b/)?.[1]
}

describe('meeting lifecycle schema', () => {
    beforeAll(async () => {
        await resetDatabase(prisma)
        await addNamedChecks()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('the named checks exist in pg_constraint', async () => {
        const rows = await prisma.$queryRaw<{ conname: string }[]>`
            SELECT conname FROM pg_constraint
            WHERE conrelid = '"CouncilMeeting"'::regclass AND contype = 'c'
            ORDER BY conname`
        expect(rows.map((r) => r.conname)).toEqual(expect.arrayContaining([
            'CouncilMeeting_continuation_owns_nothing',
            'CouncilMeeting_hidden_by_postponement_not_released',
            'CouncilMeeting_not_own_continuationOf',
            'CouncilMeeting_not_own_postponedFrom',
            'CouncilMeeting_sessionNumber_positive',
        ]))
    })

    test.each([
        ['a session number of zero', { sessionNumber: 0 }],
        ['a postponement link to itself', { postponedFromId: 'm1' }],
        ['a continuation link to itself', { continuationOfId: 'm1' }],
        ['a public meeting that a release hid', { released: true, hiddenByPostponement: true }],
    ])('the database refuses %s', async (_label, data) => {
        await createCity({ id: 'c1' })
        await expect(createMeeting('c1', { id: 'm1', ...data })).rejects.toThrow()
    })

    test('a continuation part carries neither number nor kind', async () => {
        await createCity({ id: 'c1' })
        await createMeeting('c1', { id: 'first', kind: 'regular', sessionNumber: 4 })
        await expect(createMeeting('c1', { id: 'part', continuationOfId: 'first', sessionNumber: 4 })).rejects.toThrow()
        await expect(createMeeting('c1', { id: 'part', continuationOfId: 'first', kind: 'regular' })).rejects.toThrow()
        await expect(createMeeting('c1', { id: 'part', continuationOfId: 'first' })).resolves.toBeDefined()
    })

    test('a link stays inside one city', async () => {
        await createCity({ id: 'c1' })
        await createCity({ id: 'c2' })
        await createMeeting('c1', { id: 'a', scheduleStatus: 'postponed' })
        await expect(createMeeting('c2', { id: 'b', postponedFromId: 'a' })).rejects.toThrow()
    })

    test('a postponed meeting has one new meeting only', async () => {
        await createCity({ id: 'c1' })
        await createMeeting('c1', { id: 'a', scheduleStatus: 'postponed' })
        await createMeeting('c1', { id: 'b', postponedFromId: 'a' })
        const second = createMeeting('c1', { id: 'c', postponedFromId: 'a' })
        await expect(second).rejects.toThrow()
        expect(errorCode(await second.catch((e) => e))).toBe('P2002')
    })

    test('a linked meeting cannot be deleted, but its city can', async () => {
        await createCity({ id: 'c1' })
        await createMeeting('c1', { id: 'a', scheduleStatus: 'postponed' })
        await createMeeting('c1', { id: 'b', postponedFromId: 'a' })
        await createMeeting('c1', { id: 'part', continuationOfId: 'b' })

        await expect(prisma.councilMeeting.delete({ where: { cityId_id: { cityId: 'c1', id: 'a' } } })).rejects.toThrow()
        await expect(prisma.councilMeeting.delete({ where: { cityId_id: { cityId: 'c1', id: 'b' } } })).rejects.toThrow()

        await prisma.city.delete({ where: { id: 'c1' } })
        expect(await prisma.councilMeeting.count({ where: { cityId: 'c1' } })).toBe(0)
    })

    test('new columns default to a scheduled meeting of unstated kind and format', async () => {
        await createCity({ id: 'c1' })
        const meeting = await createMeeting('c1', { id: 'm1' })
        expect(meeting).toMatchObject({
            scheduleStatus: 'scheduled',
            scheduleStatusReason: null,
            kind: null,
            sessionNumber: null,
            format: null,
            closedToPublic: false,
            place: null,
            postponedFromId: null,
            continuationOfId: null,
        })
    })
})

describe('the λογοδοσία kind backfill', () => {
    // Every name pattern of the archive that mentions λογοδοσία, and a sample of
    // the ones that do not (dates as stored; see the numbering research).
    const CASES: Array<[name: string, bodyType: 'council' | 'committee' | null, expected: 'accountability' | null]> = [
        ['Ειδική Συνεδρίαση Λογοδοσίας 26/02/2026', 'council', 'accountability'],
        ['Ειδική Συνεδρίαση Λογοδοσίας 25/06/26', 'council', 'accountability'],
        ['Ειδική Συνεδρίαση Λογοδοσίας', 'council', 'accountability'],
        ['4η Ειδική Συνεδρίαση Λογοδοσίας', 'council', 'accountability'],
        ['Ειδική Συνεδρίαση Λογοδοσίας Δημοτικού Συμβουλίου 03/06/26', 'council', 'accountability'],
        ['Ειδική Συνεδρίαση Λογοδοσίας 30/10/2025', null, 'accountability'],
        // Two meetings in one record: the regular part produces decisions.
        ['Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26', 'council', null],
        ['Δημοτικό Συμβούλιο και Λογοδοσία 11/03/26', 'council', null],
        ['Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 29/08/25', 'council', null],
        ['Ειδική Συνεδρίαση Λογοδοσίας & Τακτική Συνεδρίαση 18/03/26', 'council', null],
        // λογοδοσία exists for the council only.
        ['Ειδική Συνεδρίαση Λογοδοσίας 26/02/2026', 'committee', null],
        // Not λογοδοσία at all.
        ['Δημοτικό Συμβούλιο 12/03/2026', 'council', null],
        ['Ειδική Συνεδρίαση Δημοτικού Συμβουλίου 26/01/26', 'council', null],
        ['[Ακυρώθηκε] Δημοτικό Συμβούλιο 12/03/2026', 'council', null],
        ['Ειδική Συνεδρίαση Απολογισμού για το 2024', 'council', null],
    ]

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('sets the kind of pure λογοδοσία records and leaves every other record unknown', async () => {
        await createCity({ id: 'c1' })
        const council = await createAdministrativeBody('c1', { type: 'council' })
        const committee = await createAdministrativeBody('c1', { type: 'committee', name: 'Committee', name_en: 'Committee' })
        for (const [i, [name, bodyType]] of CASES.entries()) {
            await createMeeting('c1', {
                id: `m${i}`,
                name,
                administrativeBodyId: bodyType === 'council' ? council.id : bodyType === 'committee' ? committee.id : null,
            })
        }
        // A kind that an admin already set is never overwritten.
        await createMeeting('c1', { id: 'set', name: 'Ειδική Συνεδρίαση Λογοδοσίας 01/01/26', kind: 'budget', administrativeBodyId: council.id })

        const updated = await runKindBackfill()

        const rows = await prisma.councilMeeting.findMany({ where: { cityId: 'c1' }, select: { id: true, kind: true } })
        const kindOf = new Map(rows.map((r) => [r.id, r.kind]))
        for (const [i, [name, bodyType, expected]] of CASES.entries()) {
            expect({ name, bodyType, kind: kindOf.get(`m${i}`) }).toEqual({ name, bodyType, kind: expected })
        }
        expect(kindOf.get('set')).toBe('budget')
        expect(updated).toBe(CASES.filter(([, , expected]) => expected).length)
    })
})

describe('the unstated format migration', () => {
    const FORMAT_MIGRATION = path.join(
        __dirname,
        '../../prisma/migrations/20261009130000_meeting_format_unstated/migration.sql',
    )
    const LIFECYCLE_RAN_AT = new Date('2026-10-06T13:00:00Z')

    beforeEach(async () => {
        await resetDatabase(prisma)
        // `prisma db push` builds the test database, so it has no migration log.
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
                "id" TEXT PRIMARY KEY, "migration_name" TEXT NOT NULL,
                "finished_at" TIMESTAMPTZ, "rolled_back_at" TIMESTAMPTZ
            )`)
        await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`)
        // A failed attempt, rolled back and retried, leaves rows of its own.
        await prisma.$executeRaw`
            INSERT INTO "_prisma_migrations" ("id", "migration_name", "finished_at", "rolled_back_at")
            VALUES ('0', '20261006130000_meeting_lifecycle', NULL, ${new Date('2026-10-06T12:00:00Z')}),
                   ('1', '20261006130000_meeting_lifecycle', ${LIFECYCLE_RAN_AT}, NULL)`
    })

    afterAll(async () => {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "_prisma_migrations"`)
    })

    test('clears the format that the lifecycle migration gave, and keeps one that may be stated', async () => {
        await createCity({ id: 'c1' })
        const before = new Date(LIFECYCLE_RAN_AT.getTime() - 60_000)
        const after = new Date(LIFECYCLE_RAN_AT.getTime() + 60_000)
        await createMeeting('c1', { id: 'archive', createdAt: before, format: 'inPerson' })
        await createMeeting('c1', { id: 'archive-teams', createdAt: before, format: 'teleconference' })
        await createMeeting('c1', { id: 'stated', createdAt: after, format: 'inPerson' })
        await createMeeting('c1', { id: 'archive-edited', createdAt: before, format: 'inPerson' })
        // @updatedAt is set by Prisma on every write, so set the times in SQL.
        await prisma.$executeRaw`UPDATE "CouncilMeeting" SET "updatedAt" = ${before} WHERE id IN ('archive', 'archive-teams')`
        await prisma.$executeRaw`UPDATE "CouncilMeeting" SET "updatedAt" = ${after} WHERE id IN ('stated', 'archive-edited')`

        const sql = fs.readFileSync(FORMAT_MIGRATION, 'utf8')
        const [update] = splitSqlStatements(sql)
            .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
            .filter((s) => /^UPDATE "CouncilMeeting"/.test(s))
        expect(await prisma.$executeRawUnsafe(update)).toBe(1)

        const rows = await prisma.councilMeeting.findMany({ where: { cityId: 'c1' }, select: { id: true, format: true } })
        expect(Object.fromEntries(rows.map((r) => [r.id, r.format]))).toEqual({
            archive: null,
            'archive-teams': 'teleconference',
            stated: 'inPerson',
            // An admin set inPerson on an archive meeting after the lifecycle migration.
            'archive-edited': 'inPerson',
        })
    })
})

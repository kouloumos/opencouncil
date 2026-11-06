/** @jest-environment node */
// The MCP tools of generic mode (OpenTranscripts): get_transcript reads a
// workspace transcript the way it reads a council meeting, and the workspace
// tools list what a caller administers.
jest.mock('@/lib/genericMode', () => ({ ...jest.requireActual('@/lib/genericMode'), isGenericMode: () => true }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetTranscript } from '@/lib/mcp/data'
import { mcpCreateTranscript, mcpListTranscripts, mcpListWorkspaces } from '@/lib/mcp/workspaceData'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { resolveAdminAccess } from '@/lib/mcp/adminAccess'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSpeakerSegment, createSpeakerTag, createUser, createUtterance } from '../helpers/factories'

const options = { page: 1, pageSize: 10, includeUtteranceIds: false }

/** Run a tool as the route does: with the caller's identity and admin access in the request context. */
async function asCaller<T>(userId: string, fn: () => Promise<T>) {
    const adminAccess = await resolveAdminAccess({ userId })
    return mcpRealmStore.run(requestContext(Realm.greece, 'transcripts.example', { userId }, { adminAccess }), fn)
}

describe('MCP get_transcript on a workspace transcript - integration', () => {
    let superadmin: string
    let member: string
    let outsider: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await prisma.workspace.create({ data: { id: 'ws1', name: 'Workspace' } })
        await prisma.transcript.create({ data: { id: 't1', workspaceId: 'ws1', name: 'Interview' } })
        await prisma.speaker.create({ data: { id: 'sp1', workspaceId: 'ws1', name: 'Eleni M.' } })

        const named = await createSpeakerTag({ label: 'SPEAKER_0', personId: 'sp1' })
        const unnamed = await createSpeakerTag({ label: 'SPEAKER_1' })
        const first = await createSpeakerSegment('t1', 'ws1', { speakerTagId: named.id, startTimestamp: 0, endTimestamp: 10 })
        const second = await createSpeakerSegment('t1', 'ws1', { speakerTagId: unnamed.id, startTimestamp: 10, endTimestamp: 20 })
        await createUtterance(first.id, { text: 'How was the neighbourhood then?', startTimestamp: 0, endTimestamp: 10 })
        await createUtterance(second.id, { text: 'Small houses with yards.', startTimestamp: 10, endTimestamp: 20 })

        superadmin = (await createUser('superadmin@test.com', { isSuperAdmin: true })).id
        member = (await createUser('member@test.com')).id
        await prisma.administers.create({ data: { userId: member, cityId: 'ws1' } })
        outsider = (await createUser('outsider@test.com')).id
    })

    test('names the speakers and links to the workspace transcript', async () => {
        const result = await asCaller(superadmin, () => mcpGetTranscript('ws1', 't1', options, { userId: superadmin }))

        expect(result.segments.map(segment => [segment.speaker, segment.text])).toEqual([
            ['Eleni M.', 'How was the neighbourhood then?'],
            ['SPEAKER_1', 'Small houses with yards.'],
        ])
        expect(result.segments[1].url).toMatch(/\/workspaces\/ws1\/transcripts\/t1\?t=10$/)
        expect(result.url).toMatch(/\/workspaces\/ws1\/transcripts\/t1$/)
    })

    test('filters by a workspace speaker', async () => {
        const result = await asCaller(superadmin, () =>
            mcpGetTranscript('ws1', 't1', { ...options, personId: 'sp1' }, { userId: superadmin }))

        expect(result.speaker).toBe('Eleni M.')
        expect(result.segments).toHaveLength(1)
    })

    test('lets a member of the workspace read it, as a city admin reads a draft', async () => {
        const result = await asCaller(member, () => mcpGetTranscript('ws1', 't1', options, { userId: member }))

        expect(result.segments).toHaveLength(2)
    })

    test('is not found for someone outside the workspace', async () => {
        await expect(asCaller(outsider, () => mcpGetTranscript('ws1', 't1', options, { userId: outsider })))
            .rejects.toThrow('Transcript not found')
    })

    test('does not reach the transcript of a council meeting', async () => {
        await createCity({ id: 'c1' })
        await createMeeting('c1', { id: 'm1' })

        await expect(asCaller(superadmin, () => mcpGetTranscript('c1', 'm1', options, { userId: superadmin })))
            .rejects.toThrow('Transcript not found')
    })
})

describe('MCP workspace listings - integration', () => {
    let superadmin: string
    let member: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await prisma.workspace.create({ data: { id: 'ws1', name: 'Oral history' } })
        await prisma.workspace.create({ data: { id: 'ws2', name: 'Podcast' } })
        await prisma.transcript.create({ data: { id: 't1', workspaceId: 'ws1', name: 'Interview' } })
        const tag = await createSpeakerTag({ label: 'SPEAKER_0' })
        await createSpeakerSegment('t1', 'ws1', { speakerTagId: tag.id })
        await prisma.taskStatus.create({
            data: { type: 'transcribe', status: 'failed', requestBody: '{}', councilMeetingId: 't1', cityId: 'ws1' },
        })
        await createCity({ id: 'c1' })

        superadmin = (await createUser('superadmin@test.com', { isSuperAdmin: true })).id
        member = (await createUser('member@test.com')).id
        await prisma.administers.create({ data: { userId: member, cityId: 'ws1' } })
    })

    test('lists every workspace to a superadmin, and no city', async () => {
        const { workspaces } = await asCaller(superadmin, () => mcpListWorkspaces({ userId: superadmin }))

        expect(workspaces.map(workspace => workspace.id).sort()).toEqual(['ws1', 'ws2'])
        expect(workspaces.find(workspace => workspace.id === 'ws1')).toMatchObject({ transcripts: 1, members: 1, failed: 1, running: 0 })
    })

    test('lists only the workspaces a member administers', async () => {
        const { workspaces } = await asCaller(member, () => mcpListWorkspaces({ userId: member }))

        expect(workspaces.map(workspace => workspace.id)).toEqual(['ws1'])
    })

    test('lists the transcripts of a workspace with their latest task', async () => {
        const result = await asCaller(superadmin, () =>
            mcpListTranscripts({ userId: superadmin }, { cityId: 'ws1', page: 1, pageSize: 10 }))

        expect(result.pagination).toMatchObject({ total: 1 })
        expect(result.transcripts).toEqual([expect.objectContaining({
            id: 't1',
            segments: 1,
            latestTask: expect.objectContaining({ type: 'transcribe', status: 'failed' }),
        })])
    })

    test('refuses a member the transcripts of another workspace, and a city', async () => {
        await expect(asCaller(member, () => mcpListTranscripts({ userId: member }, { cityId: 'ws2', page: 1, pageSize: 10 })))
            .rejects.toThrow()
        await expect(asCaller(superadmin, () => mcpListTranscripts({ userId: superadmin }, { cityId: 'c1', page: 1, pageSize: 10 })))
            .rejects.toThrow('Workspace not found')
    })

    test('creates a transcript with its recording, for start_task to fill', async () => {
        const created = await asCaller(member, () => mcpCreateTranscript({ userId: member }, {
            cityId: 'ws1', name: 'Second interview', videoUrl: 'https://cdn.example/second.mp3',
        }))

        expect(created).toMatchObject({ cityId: 'ws1', name: 'Second interview', videoUrl: 'https://cdn.example/second.mp3' })
        expect(created.url).toMatch(new RegExp(`/workspaces/ws1/transcripts/${created.meetingId}$`))
        expect(await prisma.transcript.findUnique({
            where: { workspaceId_id: { workspaceId: 'ws1', id: created.meetingId } },
            select: { name: true, released: true },
        })).toEqual({ name: 'Second interview', released: false })
    })

    test('creates no transcript in a workspace the caller does not administer, or in a city', async () => {
        await expect(asCaller(member, () => mcpCreateTranscript({ userId: member }, { cityId: 'ws2', name: 'x' })))
            .rejects.toThrow()
        await expect(asCaller(superadmin, () => mcpCreateTranscript({ userId: superadmin }, { cityId: 'c1', name: 'x' })))
            .rejects.toThrow('Workspace not found')
        expect(await prisma.transcript.count({ where: { name: 'x' } })).toBe(0)
    })
})

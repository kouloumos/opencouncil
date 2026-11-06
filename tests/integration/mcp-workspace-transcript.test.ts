/** @jest-environment node */
// get_transcript in generic mode (OpenTranscripts): the tool reads a workspace
// transcript the way it reads a council meeting.
jest.mock('@/lib/genericMode', () => ({ ...jest.requireActual('@/lib/genericMode'), isGenericMode: () => true }))

import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetTranscript } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSpeakerSegment, createSpeakerTag, createUser, createUtterance } from '../helpers/factories'

const options = { page: 1, pageSize: 10, includeUtteranceIds: false }

function asCaller<T>(userId: string, fn: () => Promise<T>) {
    return mcpRealmStore.run(requestContext(Realm.greece, 'transcripts.example', { userId }), fn)
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

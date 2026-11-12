/** @jest-environment node */
// findVoiceprintTasks feeds findVoiceData, whose clip URLs are deleted. The
// database filter is a text match (`contains`), so the parsed personId is the
// only thing that keeps person p1 from collecting p10's clip.
const mockTaskFindMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findMany: (...args: unknown[]) => mockTaskFindMany(...args) } },
}));

import { findVoiceprintTasks } from '../voiceprintTasks';

const row = (id: string, requestBody: string, responseBody: string | null = null) => ({ id, requestBody, responseBody });

beforeEach(() => mockTaskFindMany.mockReset());

describe('findVoiceprintTasks', () => {
    it('keeps only the tasks whose parsed personId is the person, though the text match also finds p10 and a segment id', async () => {
        // What `requestBody contains "p1"` returns for person p1.
        mockTaskFindMany.mockResolvedValue([
            row('t1', JSON.stringify({ personId: 'p1', cityId: 'chania', segmentId: 's1' }), JSON.stringify({ audioUrl: 'https://x/voiceprints/chania/p1/a.mp3' })),
            row('t2', JSON.stringify({ personId: 'p10', cityId: 'chania', segmentId: 's2' }), JSON.stringify({ audioUrl: 'https://x/voiceprints/chania/p10/b.mp3' })),
            row('t3', JSON.stringify({ personId: 'p7', cityId: 'chania', segmentId: 'p1-seg' })),
            row('t4', 'not json'),
        ]);

        const tasks = await findVoiceprintTasks({ personId: 'p1' });

        expect(mockTaskFindMany).toHaveBeenCalledWith({
            where: { type: 'generateVoiceprint', requestBody: { contains: 'p1' } },
            orderBy: { createdAt: 'desc' },
        });
        expect(tasks.map(({ task }) => task.id)).toEqual(['t1']);
        expect(tasks[0].result).toEqual({ audioUrl: 'https://x/voiceprints/chania/p1/a.mp3' });
    });

    it('reads a city by the task cityId, and a task with no result has a null result', async () => {
        mockTaskFindMany.mockResolvedValue([row('t1', JSON.stringify({ personId: 'p1', cityId: 'chania' }), null)]);

        const tasks = await findVoiceprintTasks({ cityId: 'chania' });

        expect(mockTaskFindMany.mock.calls[0][0].where).toEqual({ type: 'generateVoiceprint', cityId: 'chania' });
        expect(tasks).toEqual([expect.objectContaining({ result: null })]);
    });
});

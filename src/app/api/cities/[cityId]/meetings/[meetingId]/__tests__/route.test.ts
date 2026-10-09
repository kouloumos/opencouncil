/** @jest-environment node */
// The single-meeting GET has no auth. The new meeting of a postponement must
// not name the meeting that it replaced, which readers can no longer see.
jest.mock('@/lib/getMeetingData', () => ({ getMeetingDataCore: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(false) }));
jest.mock('@/lib/meetingWrites', () => ({ updateMeetingWithEffects: jest.fn() }));

import { GET } from '../route';
import { getMeetingDataCore } from '@/lib/getMeetingData';
import { isUserAuthorizedToEdit } from '@/lib/auth';

const mockCore = getMeetingDataCore as jest.MockedFunction<typeof getMeetingDataCore>;

function meetingData(postponedFromId: string | null, closedToPublic = false) {
    return {
        meeting: {
            id: 'mar19_2026',
            cityId: 'chania',
            name: null,
            name_en: null,
            kind: 'regular',
            dateTime: new Date('2026-03-19T16:00:00Z'),
            format: 'inPerson',
            closedToPublic,
            youtubeUrl: 'https://youtu.be/x',
            videoUrl: 'https://cdn/v.mp4',
            audioUrl: null,
            muxPlaybackId: 'mux1',
            place: null,
            postponedFromId,
            postponedFromDate: new Date('2026-03-12T16:00:00Z'),
            administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: null },
        },
        city: { timezone: 'Europe/Athens' },
        transcript: [{ id: 'seg1' }],
        speakerTags: [{ id: 'tag1' }],
        transcriptHiddenForReview: false,
    } as unknown as Awaited<ReturnType<typeof getMeetingDataCore>>;
}

describe('GET /api/cities/[cityId]/meetings/[meetingId]', () => {
    it.each([null, 'mar12_2026'])('never returns the id of the postponed meeting (link in the row: %s)', async (postponedFromId) => {
        mockCore.mockResolvedValue(meetingData(postponedFromId));
        const response = await GET({} as Request, { params: Promise.resolve({ cityId: 'chania', meetingId: 'mar19_2026' }) });
        const text = await response.text();
        expect(text).not.toContain('postponedFromId');
        expect(text).not.toContain('mar12_2026');
        expect(JSON.parse(text).meeting).toMatchObject({
            name: 'Δημοτικό Συμβούλιο · Τακτική Συνεδρίαση · 19/03/2026',
            title: 'Τακτική Συνεδρίαση',
            name_en: 'Municipal Council · Regular Meeting · 19/03/2026',
            postponedFromDate: '2026-03-12T16:00:00.000Z',
        });
    });

    it('returns no transcript for a meeting that is closed to the public', async () => {
        mockCore.mockResolvedValue(meetingData(null, true));
        const response = await GET({} as Request, { params: Promise.resolve({ cityId: 'chania', meetingId: 'mar19_2026' }) });
        const body = await response.json();
        expect(body.transcript).toEqual([]);
        expect(body.speakerTags).toEqual([]);
        expect(body.meeting).toMatchObject({ youtubeUrl: null, videoUrl: null, muxPlaybackId: null });
        mockCore.mockResolvedValue(meetingData(null, false));
        const open = await (await GET({} as Request, { params: Promise.resolve({ cityId: 'chania', meetingId: 'mar19_2026' }) })).json();
        expect(open.transcript).toHaveLength(1);
    });

    it('keeps the transcript of a closed meeting for an editor, who exports it', async () => {
        (isUserAuthorizedToEdit as jest.Mock).mockResolvedValueOnce(true);
        mockCore.mockResolvedValue(meetingData(null, true));
        const body = await (await GET({} as Request, { params: Promise.resolve({ cityId: 'chania', meetingId: 'mar19_2026' }) })).json();
        expect(body.transcript).toHaveLength(1);
        expect(body.meeting.muxPlaybackId).toBe('mux1');
    });
});

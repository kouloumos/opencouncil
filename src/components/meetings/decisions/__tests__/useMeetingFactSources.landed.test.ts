jest.mock('@/lib/actions/meetingFacts', () => ({ requestReadTranscriptFacts: jest.fn() }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));

import { landed, type MeetingFactSource, type PendingRead } from '../useMeetingFactSources';

const row = (o: Partial<MeetingFactSource> & Pick<MeetingFactSource, 'source'>): MeetingFactSource => ({
    id: `r-${o.source}`, status: 'read', fileName: null, mediaType: null, reading: null, readerVersion: null,
    taskId: 't1', uploadedById: null, confirmedById: null, confirmedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...o,
});

describe('landed', () => {
    it('a transcript read has not landed while the transcript has no row: its result creates the row', () => {
        const pending: PendingRead = { source: 'transcript', taskId: 't1', baselineUpdatedAt: null };
        expect(landed(pending, [])).toBe(false);
        expect(landed(pending, [row({ source: 'transcript', taskId: 't1' })])).toBe(true);
        expect(landed(pending, [row({ source: 'transcript', taskId: 't0' })])).toBe(false);
    });
    it('a sheet read whose row is gone has nothing left to wait for', () => {
        const pending: PendingRead = { source: 'sheet', taskId: 't1', baselineUpdatedAt: null };
        expect(landed(pending, [])).toBe(true);
        expect(landed(pending, [row({ source: 'sheet', status: 'uploaded' })])).toBe(false);
        expect(landed(pending, [row({ source: 'sheet', status: 'read' })])).toBe(true);
    });
});

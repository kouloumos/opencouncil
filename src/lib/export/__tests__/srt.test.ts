import { generateSrt, formatSrtTimestamp } from '@/lib/export/srt';
import type { Transcript } from '@/lib/db/transcript';

type UtteranceFixture = { startTimestamp: number; endTimestamp: number; text: string };

function makeTranscript(segments: UtteranceFixture[][]): Transcript {
    return segments.map((utterances, i) => ({
        id: `segment-${i}`,
        utterances: utterances.map((u, j) => ({ id: `utterance-${i}-${j}`, ...u })),
    })) as unknown as Transcript;
}

describe('formatSrtTimestamp', () => {
    it('formats zero as 00:00:00,000', () => {
        expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    });

    it('uses a comma separator and pads milliseconds', () => {
        expect(formatSrtTimestamp(5.5)).toBe('00:00:05,500');
        expect(formatSrtTimestamp(65.043)).toBe('00:01:05,043');
    });

    it('handles durations over one hour', () => {
        expect(formatSrtTimestamp(3661.25)).toBe('01:01:01,250');
    });
});

describe('generateSrt', () => {
    it('renders one numbered cue per utterance', () => {
        const srt = generateSrt(makeTranscript([[
            { startTimestamp: 0, endTimestamp: 1.5, text: 'Hello there.' },
            { startTimestamp: 1.5, endTimestamp: 3, text: 'Second line.' },
        ]]));
        expect(srt).toBe(
            '1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n' +
            '2\n00:00:01,500 --> 00:00:03,000\nSecond line.\n'
        );
    });

    it('flattens multiple segments and orders cues by start time', () => {
        const srt = generateSrt(makeTranscript([
            [{ startTimestamp: 10, endTimestamp: 12, text: 'Later.' }],
            [{ startTimestamp: 2, endTimestamp: 4, text: 'Earlier.' }],
        ]));
        const lines = srt.split('\n');
        expect(lines[2]).toBe('Earlier.');
        expect(lines[6]).toBe('Later.');
    });

    it('skips empty and whitespace-only utterances without gaps in numbering', () => {
        const srt = generateSrt(makeTranscript([[
            { startTimestamp: 0, endTimestamp: 1, text: '   ' },
            { startTimestamp: 1, endTimestamp: 2, text: 'Kept.' },
        ]]));
        expect(srt.startsWith('1\n00:00:01,000')).toBe(true);
        expect(srt).not.toContain('2\n');
    });

    it('clamps end timestamps that are not after the start', () => {
        const srt = generateSrt(makeTranscript([[
            { startTimestamp: 5, endTimestamp: 4, text: 'Weird timing.' },
        ]]));
        expect(srt).toContain('00:00:05,000 --> 00:00:05,000');
    });

    it('returns an empty string for a transcript with no utterances', () => {
        expect(generateSrt(makeTranscript([[]]))).toBe('');
    });
});

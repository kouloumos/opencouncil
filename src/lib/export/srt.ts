import { Transcript } from '@/lib/db/transcript';
import { formatTimestamp } from '@/lib/formatters/time';

/**
 * Formats a time in seconds as an SRT timestamp (HH:MM:SS,mmm).
 * SRT uses a comma as the millisecond separator.
 */
export function formatSrtTimestamp(seconds: number): string {
    return formatTimestamp(seconds, true).replace('.', ',');
}

/**
 * Renders a transcript as a SubRip (.srt) subtitle file: one cue per
 * utterance, ordered by start time, with empty utterances skipped.
 */
export function generateSrt(transcript: Transcript): string {
    const utterances = transcript
        .flatMap(segment => segment.utterances)
        .filter(utterance => utterance.text.trim().length > 0)
        .sort((a, b) => a.startTimestamp - b.startTimestamp);

    return utterances
        .map((utterance, index) => {
            const start = utterance.startTimestamp;
            const end = Math.max(utterance.endTimestamp, start);
            return `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${utterance.text.trim()}\n`;
        })
        .join('\n');
}

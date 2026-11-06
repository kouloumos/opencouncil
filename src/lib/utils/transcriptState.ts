export type TranscriptState = 'running' | 'done' | 'failed';

/** What the latest task of a transcript says about it; null before any task ran. */
export function transcriptState(latestTaskStatus: string | undefined): TranscriptState | null {
  if (latestTaskStatus === 'pending') return 'running';
  if (latestTaskStatus === 'succeeded') return 'done';
  if (latestTaskStatus === 'failed') return 'failed';
  return null;
}

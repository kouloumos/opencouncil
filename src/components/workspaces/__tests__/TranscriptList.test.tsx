import { createElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import type { TranscriptMinimal } from '@/lib/db/transcripts';
import { TranscriptList } from '../TranscriptList';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
        createElement('a', { href, className }, children),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

function transcript(id: string, task: { status: string; stage?: string | null; percentComplete?: number | null } | null): TranscriptMinimal {
    return {
        id,
        name: `Συνέντευξη ${id}`,
        createdAt: new Date('2026-11-02T10:00:00Z'),
        taskStatuses: task ? [{ id: `task-${id}`, type: 'transcribe', stage: null, percentComplete: null, ...task }] : [],
        _count: { speakerSegments: 113, taskStatuses: task ? 1 : 0 },
    } as unknown as TranscriptMinimal;
}

function row(name: string) {
    return screen.getByText(name).closest('li') as HTMLElement;
}

describe('TranscriptList', () => {
    it('shows the state of the latest task of each transcript', () => {
        render(
            <TranscriptList
                workspaceId="ws1"
                canEdit
                transcripts={[
                    transcript('a', { status: 'succeeded' }),
                    transcript('b', { status: 'pending', stage: 'transcribing', percentComplete: 64.4 }),
                    transcript('c', { status: 'failed' }),
                    transcript('d', null),
                ]}
            />,
        );

        expect(within(row('Συνέντευξη a')).getByText('ready')).toBeInTheDocument();
        expect(within(row('Συνέντευξη a')).getByText('segmentsCount 113')).toBeInTheDocument();
        // A running transcription shows its stage and progress instead of the segment count.
        expect(within(row('Συνέντευξη b')).getByText('transcribing · 64%')).toBeInTheDocument();
        expect(within(row('Συνέντευξη b')).queryByText('segmentsCount 113')).not.toBeInTheDocument();
        expect(within(row('Συνέντευξη c')).getByText('failed')).toBeInTheDocument();
        expect(within(row('Συνέντευξη d')).queryByText(/ready|failed|transcribing/)).not.toBeInTheDocument();
    });

    it('names the transcript on its delete button, and offers it only with the right to delete', () => {
        const { rerender } = render(<TranscriptList workspaceId="ws1" canEdit canDelete transcripts={[transcript('a', null)]} />);
        expect(screen.getByRole('button', { name: 'deleteTranscript Συνέντευξη a' })).toBeInTheDocument();

        rerender(<TranscriptList workspaceId="ws1" canEdit transcripts={[transcript('a', null)]} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

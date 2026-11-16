import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UploadTranscriptForm } from '../UploadTranscriptForm';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/i18n/routing', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

it('disables creation while uploading a replacement for an existing URL', async () => {
    let finishUpload: (response: Response) => void = () => {};
    const fetchMock = jest.fn(() => new Promise<Response>(resolve => { finishUpload = resolve; }));
    const originalFetch = global.fetch;
    global.fetch = fetchMock;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
        const { container } = render(<UploadTranscriptForm workspaceId="ws1" />);
        fireEvent.change(screen.getByLabelText('transcriptName'), { target: { value: 'Planning' } });
        fireEvent.change(screen.getByLabelText('videoLabel'), { target: { value: 'https://example.com/old.mp3' } });
        const submit = screen.getByRole('button', { name: 'uploadButton' });
        expect(submit).toBeEnabled();

        const picker = container.querySelector('input[type="file"]');
        if (!picker) throw new Error('Missing file picker');
        fireEvent.change(picker, { target: { files: [new File(['audio'], 'replacement.mp3')] } });

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(submit).toBeDisabled();

        finishUpload({ ok: false, status: 400, json: async () => ({ error: 'Upload unavailable' }) } as Response);
        expect(await screen.findByText('Upload unavailable')).toBeInTheDocument();
        expect(submit).toBeEnabled();
    } finally {
        global.fetch = originalFetch;
        consoleError.mockRestore();
    }
});

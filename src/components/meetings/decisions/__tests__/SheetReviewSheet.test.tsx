import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SheetReviewSheet } from '../SheetReviewSheet';
import type { MeetingFactSource } from '../useMeetingFactSources';
import type { MeetingFactsReading } from '@/lib/apiTypes';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

const reading: MeetingFactsReading = {
    rollCall: {
        entries: [
            { name: 'Παπαδόπουλος Γ.', personId: 'p1', status: 'PRESENT', absenceJustified: null, rawText: 'Παπαδόπουλος Γ. ✓', utteranceId: null, line: 3 },
            { name: 'Δήμου Κ.', personId: null, status: 'ABSENT', absenceJustified: null, rawText: 'Δήμου Κ. –', utteranceId: null, line: 4 },
        ],
        rawText: 'ΠΑΡΟΝΤΕΣ …',
        utteranceIds: [],
    },
    attendanceChanges: [
        {
            personId: 'p1', name: 'Παπαδόπουλος Γ.', type: 'departure',
            anchor: { kind: 'agenda_item', agendaItemIndex: 4, nonAgendaReason: null, decisionNumber: null, phase: null, timing: 'before' },
            rawText: 'αποχώρησε πριν το 4ο', reportingPdfCount: 1, totalPdfCount: 1, utteranceId: null, line: 9,
        },
    ],
    votes: [{ items: [{ kind: 'agenda_item', from: 1, to: 1 }], outcome: 'majority', phrase: 'κατά πλειοψηφία', namedVotes: [], partyVotes: [], rawText: '1ο: κατά πλειοψηφία', utteranceIds: [], line: 12, confidence: 80 }],
    presidedBy: { name: 'Πρόεδρος', personId: 'p2', rawText: 'Προεδρεύων: Πρόεδρος' },
    nameMatches: [{ name: 'Παπαδόπουλος Γ.', personId: 'p1', method: 'token' }],
    unmatchedNames: ['Δήμου Κ.'],
    warnings: [{ code: 'FAINT', severity: 'info', message: 'faint ink' }],
};

const source: MeetingFactSource = {
    id: 'row', source: 'sheet', status: 'read', fileName: 'sheet.jpg', mediaType: 'image/jpeg', reading, readerVersion: '1',
    taskId: 't1', uploadedById: null, confirmedById: null, confirmedAt: null,
    createdAt: '2026-06-15T18:00:00.000Z', updatedAt: '2026-06-15T18:00:00.000Z',
};

const people = [{ id: 'p2', name: 'Βασιλείου Μ.' }, { id: 'p1', name: 'Παπαδόπουλος Γ.' }, { id: 'p3', name: 'Δήμου Κ.' }];

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? '{}') as { reading: MeetingFactsReading; confirm: boolean };
        return { ok: true, status: 200, json: async () => ({ source: { ...source, reading: body.reading, status: body.confirm ? 'confirmed' : 'read' } }) };
    });
    global.fetch = fetchMock;
});
afterAll(() => { global.fetch = originalFetch; });

function renderSheet(overrides: Partial<React.ComponentProps<typeof SheetReviewSheet>> = {}) {
    const onSaved = jest.fn();
    const onOpenChange = jest.fn();
    render(
        <SheetReviewSheet
            open
            onOpenChange={onOpenChange}
            cityId="athens"
            meetingId="m1"
            source={source}
            people={people}
            onSaved={onSaved}
            {...overrides}
        />,
    );
    return { onSaved, onOpenChange };
}

const sentBody = (call = 0) => JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as { reading: MeetingFactsReading; confirm: boolean };

describe('SheetReviewSheet', () => {
    it('shows the sheet beside the reading, with the people sorted by name', () => {
        renderSheet();
        expect(screen.getByAltText('fileTitle')).toHaveAttribute('src', expect.stringContaining('/api/cities/athens/meetings/m1/sheet?file=1'));
        const rows = screen.getAllByRole('row');
        expect(rows[1]).toHaveTextContent('Παπαδόπουλος Γ.');
        expect(rows[1]).toHaveTextContent('line{"line":3}');
        expect(screen.getByLabelText('colPerson Παπαδόπουλος Γ.')).toHaveValue('p1');
        const select = screen.getByLabelText('colPerson Δήμου Κ.') as HTMLSelectElement;
        expect([...select.options].map(o => o.textContent)).toEqual(['nobody', 'Βασιλείου Μ.', 'Δήμου Κ.', 'Παπαδόπουλος Γ.']);
        expect(select.value).toBe('');
        expect(screen.getByText('outcome.majority')).toBeInTheDocument();
    });

    it('sends the corrected reading whole on confirm, and hands the stored row back', async () => {
        const { onSaved, onOpenChange } = renderSheet();
        // The first entry was read as present; the reviewer says absent, justified.
        fireEvent.click(screen.getByLabelText('colStatus Παπαδόπουλος Γ.'));
        fireEvent.click(screen.getByLabelText('colJustified Παπαδόπουλος Γ.'));
        // The second name matched nobody; the reviewer names the person.
        fireEvent.change(screen.getByLabelText('colPerson Δήμου Κ.'), { target: { value: 'p3' } });
        fireEvent.click(screen.getByText('confirm'));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(fetchMock).toHaveBeenCalledWith('/api/cities/athens/meetings/m1/sheet', expect.objectContaining({ method: 'PATCH' }));
        const body = sentBody();
        expect(body.confirm).toBe(true);
        expect(body.reading.rollCall?.entries[0]).toMatchObject({ status: 'ABSENT', absenceJustified: true, rawText: 'Παπαδόπουλος Γ. ✓' });
        expect(body.reading.rollCall?.entries[1].personId).toBe('p3');
        // The fields the form does not show reach the route as they came.
        expect(body.reading.presidedBy).toEqual(reading.presidedBy);
        expect(body.reading.nameMatches).toEqual(reading.nameMatches);
        expect(body.reading.warnings).toEqual(reading.warnings);
        expect(body.reading.rollCall?.rawText).toBe('ΠΑΡΟΝΤΕΣ …');
        expect(body.reading.votes).toEqual(reading.votes);
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }), true);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('saves without confirming, with a change edited and another removed', async () => {
        const { onSaved } = renderSheet();
        fireEvent.change(screen.getByLabelText('colType 1'), { target: { value: 'arrival' } });
        fireEvent.change(screen.getByLabelText('rawText 1'), { target: { value: 'προσήλθε στο 4ο' } });
        fireEvent.click(screen.getByText('save'));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const body = sentBody();
        expect(body.confirm).toBe(false);
        expect(body.reading.attendanceChanges[0]).toMatchObject({ type: 'arrival', rawText: 'προσήλθε στο 4ο', personId: 'p1', line: 9 });
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'read' }), false);
    });

    it('drops a change the reviewer removes', async () => {
        const { onSaved } = renderSheet();
        fireEvent.click(screen.getByText('removeChange'));
        expect(screen.getByText('changesEmpty')).toBeInTheDocument();
        fireEvent.click(screen.getByText('save'));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(sentBody().reading.attendanceChanges).toEqual([]);
    });

    it('reports a refused reading in place and stays open', async () => {
        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Not a reading' }) }));
        const { onSaved, onOpenChange } = renderSheet();
        fireEvent.click(screen.getByText('confirm'));
        expect(await screen.findByText('saveFailed{"error":"Not a reading"}')).toBeInTheDocument();
        expect(onSaved).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('frames a PDF rather than drawing it as an image', () => {
        renderSheet({ source: { ...source, mediaType: 'application/pdf', fileName: 'sheet.pdf' } });
        expect(screen.getByTitle('fileTitle').tagName).toBe('IFRAME');
    });
});

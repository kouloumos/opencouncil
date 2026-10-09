import { MeetingKind } from '@prisma/client';
import { meetingDisplayName, meetingLabel, type MeetingNameFields } from '../meetingName';

const ATHENS = 'Europe/Athens';
const council = { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' };

function meeting(overrides: Partial<MeetingNameFields> = {}): MeetingNameFields {
    return {
        name: null,
        name_en: null,
        kind: 'regular',
        sessionNumber: null,
        dateTime: new Date('2026-03-12T16:00:00Z'),
        administrativeBody: council,
        ...overrides,
    };
}

describe('meetingDisplayName', () => {
    it('is the session number and the kind, with no body and no date', () => {
        expect(meetingDisplayName(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('3η Τακτική');
        expect(meetingDisplayName(meeting({ sessionNumber: 3 }), 'en', ATHENS)).toBe('3rd Regular');
        expect(meetingDisplayName(meeting({ kind: 'urgent', sessionNumber: 2 }), 'el', ATHENS)).toBe('2η Έκτακτη');
        expect(meetingDisplayName(meeting({ kind: 'accountability', sessionNumber: 4 }), 'el', ATHENS)).toBe('4η Ειδική Λογοδοσίας');
    });

    it('names the kind in full when the meeting has no number', () => {
        expect(meetingDisplayName(meeting(), 'el', ATHENS)).toBe('Τακτική Συνεδρίαση');
        expect(meetingDisplayName(meeting(), 'en', ATHENS)).toBe('Regular Meeting');
        expect(meetingDisplayName(meeting({ kind: 'accountability' }), 'el', ATHENS)).toBe('Ειδική Συνεδρίαση Λογοδοσίας');
        expect(meetingDisplayName(meeting({ kind: 'accountability' }), 'en', ATHENS)).toBe('Special Meeting (Accountability)');
    });

    it('has a title for every kind in Greek and English', () => {
        for (const kind of Object.values(MeetingKind)) {
            for (const locale of ['el', 'en']) {
                expect(meetingDisplayName(meeting({ kind }), locale, ATHENS)).toMatch(/\S/);
                expect(meetingDisplayName(meeting({ kind, sessionNumber: 1 }), locale, ATHENS)).toMatch(/^1/);
            }
        }
    });

    it('never uses the legal word «Κατεπείγουσα»', () => {
        expect(meetingDisplayName(meeting({ kind: 'urgent' }), 'el', ATHENS)).not.toMatch(/Κατεπείγουσα/);
    });

    it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [111, '111th'], [101, '101st']])(
        'writes the English ordinal of %i as %s',
        (n, expected) => {
            expect(meetingDisplayName(meeting({ sessionNumber: n }), 'en', ATHENS)).toBe(`${expected} Regular`);
        },
    );

    it('reads «Συνεδρίαση» and the date for a meeting of unknown kind', () => {
        expect(meetingDisplayName(meeting({ kind: null, sessionNumber: 3 }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
        expect(meetingDisplayName(meeting({ kind: null }), 'en', ATHENS)).toBe('Meeting 12/03/2026');
    });

    it('uses the date of the city, not the UTC date', () => {
        // 00:30 on 12 March in Athens is 22:30 UTC on the 11th.
        const late = meeting({ kind: null, dateTime: new Date('2026-03-11T22:30:00Z') });
        expect(meetingDisplayName(late, 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
    });

    it('names a meeting by the word and the date in the locales without kind words', () => {
        const rennes = meeting({ kind: 'urgent', sessionNumber: 2, dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(rennes, 'fr', 'Europe/Paris')).toBe('Séance 12/03/2026');
        const belgrade = meeting({ dateTime: new Date('2026-03-12T17:00:00Z') });
        expect(meetingDisplayName(belgrade, 'sr', 'Europe/Belgrade')).toBe('Седница 12.03.2026.');
        expect(meetingDisplayName(belgrade, 'sr-Latn', 'Europe/Belgrade')).toBe('Sednica 12.03.2026.');
    });

    it('lets an override win, as the admin wrote it', () => {
        const special = meeting({ name: 'Κοινή Συνεδρίαση', name_en: 'Joint Meeting', sessionNumber: 3 });
        expect(meetingDisplayName(special, 'el', ATHENS)).toBe('Κοινή Συνεδρίαση');
        expect(meetingDisplayName(special, 'en', ATHENS)).toBe('Joint Meeting');
        // A Greek override with no English form: English derives its title.
        expect(meetingDisplayName(meeting({ name: 'Κοινή Συνεδρίαση' }), 'en', ATHENS)).toBe('Regular Meeting');
    });

    it('accepts the date as a string, as a serialized payload carries it', () => {
        expect(meetingDisplayName(meeting({ kind: null, dateTime: '2026-03-12T16:00:00.000Z' }), 'el', ATHENS)).toBe('Συνεδρίαση 12/03/2026');
    });
});

describe('meetingLabel', () => {
    it('puts the body and the date next to the title', () => {
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026');
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'en', ATHENS)).toBe('Municipal Council · 3rd Regular · 12/03/2026');
    });

    it('prints the date once when the title already carries it', () => {
        expect(meetingLabel(meeting({ kind: null }), 'el', ATHENS)).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
    });

    it('leaves the date out on request, unless the title carries it', () => {
        expect(meetingLabel(meeting({ sessionNumber: 3 }), 'el', ATHENS, { date: false })).toBe('Δημοτικό Συμβούλιο · 3η Τακτική');
        expect(meetingLabel(meeting({ kind: null }), 'el', ATHENS, { date: false })).toBe('Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026');
    });

    it('names a meeting with no body by its title and date', () => {
        expect(meetingLabel(meeting({ administrativeBody: null, sessionNumber: 3 }), 'el', ATHENS)).toBe('3η Τακτική · 12/03/2026');
    });

    it('keeps an override as the admin wrote it', () => {
        expect(meetingLabel(meeting({ name: '[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26' }), 'el', ATHENS)).toBe('[Διεκόπη] Δημοτικό Συμβούλιο 20/04/26');
    });
});

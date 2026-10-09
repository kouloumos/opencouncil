import type { MeetingKind } from '@prisma/client';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatNumericDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';

/**
 * What the display name of a meeting is read from. `name`/`name_en` hold an
 * override only; null means that the name is derived.
 */
export interface MeetingNameFields {
    name: string | null;
    name_en: string | null;
    kind: MeetingKind | null;
    sessionNumber: number | null;
    dateTime: Date | string;
    administrativeBody?: { name: string; name_en: string } | null;
}

interface KindWords {
    /** After a session number: «3η Τακτική». */
    short: string;
    /** Without a number: «Τακτική Συνεδρίαση». */
    full: string;
}

/**
 * The words that municipalities print on the invitation. The SQL function
 * `council_meeting_display_name` repeats them, and a test compares the two.
 * Only Greek and English have kind words; the other locales name a meeting
 * by the word for "meeting" and the date.
 */
const KIND_WORDS = {
    el: {
        regular: { short: 'Τακτική', full: 'Τακτική Συνεδρίαση' },
        urgent: { short: 'Έκτακτη', full: 'Έκτακτη Συνεδρίαση' },
        accountability: { short: 'Ειδική Λογοδοσίας', full: 'Ειδική Συνεδρίαση Λογοδοσίας' },
        activityReport: { short: 'Ειδική Απολογισμού Πεπραγμένων', full: 'Ειδική Συνεδρίαση Απολογισμού Πεπραγμένων' },
        budget: { short: 'Ειδική Προϋπολογισμού', full: 'Ειδική Συνεδρίαση Προϋπολογισμού' },
        presidencyElection: { short: 'Ειδική Εκλογής Προεδρείου', full: 'Ειδική Συνεδρίαση Εκλογής Προεδρείου' },
    },
    en: {
        regular: { short: 'Regular', full: 'Regular Meeting' },
        urgent: { short: 'Urgent', full: 'Urgent Meeting' },
        accountability: { short: 'Special (Accountability)', full: 'Special Meeting (Accountability)' },
        activityReport: { short: 'Special (Activity Report)', full: 'Special Meeting (Activity Report)' },
        budget: { short: 'Special (Budget)', full: 'Special Meeting (Budget)' },
        presidencyElection: { short: 'Special (Presidency Election)', full: 'Special Meeting (Presidency Election)' },
    },
} as const satisfies Record<'el' | 'en', Record<MeetingKind, KindWords>>;

/** The word for a meeting whose kind the title cannot name. Serbian Latin comes from the Cyrillic. */
const MEETING_WORD: Record<string, string> = { el: 'Συνεδρίαση', en: 'Meeting', fr: 'Séance', sr: 'Седница' };

function ordinal(n: number, locale: 'el' | 'en'): string {
    if (locale === 'el') return `${n}η`;
    const lastTwo = n % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
    return `${n}${suffix}`;
}

function kindLocale(locale: string): 'el' | 'en' | null {
    return locale === 'el' || locale === 'en' ? locale : null;
}

/**
 * The derived title, and whether it carries the date. A title with a known
 * kind does not: «3η Τακτική». A null kind gives «Συνεδρίαση 12/03/2026».
 */
function derivedTitle(meeting: MeetingNameFields, locale: string, timezone: string): { text: string; dated: boolean } {
    const words = kindLocale(locale);
    if (words && meeting.kind) {
        const kind = KIND_WORDS[words][meeting.kind];
        const text = meeting.sessionNumber ? `${ordinal(meeting.sessionNumber, words)} ${kind.short}` : kind.full;
        return { text, dated: false };
    }
    const word = MEETING_WORD[locale.split('-')[0]] ?? MEETING_WORD.en;
    return { text: localizeText(`${word} ${meetingDate(meeting, locale, timezone)}`, locale), dated: true };
}

function override(meeting: MeetingNameFields, locale: string): string | null {
    const value = locale === 'en' ? meeting.name_en : meeting.name;
    return value ? localizeText(value, locale) : null;
}

function meetingDate(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return formatNumericDate(new Date(meeting.dateTime), timezone, locale);
}

/**
 * The title of a meeting for a locale: the override when an admin set one,
 * otherwise the session number and the kind, «3η Τακτική». The title has no
 * body and, for a known kind, no date. Use it where the body and the date
 * are shown next to it: the meeting page, the cards, a list of one body.
 * Everywhere else, use `meetingLabel`.
 */
export function meetingDisplayName(meeting: MeetingNameFields, locale: string, timezone: string): string {
    return override(meeting, locale) ?? derivedTitle(meeting, locale, timezone).text;
}

/** `meetingDisplayName` for a row that carries the timezone of its city. */
export function meetingNameInCity(meeting: MeetingNameFields & { city: { timezone: string } }, locale: string): string {
    return meetingDisplayName(meeting, locale, meeting.city.timezone);
}

/**
 * The name of a meeting for a reader that prints it alone: an alert, an
 * email, a feed, a share text, a tool result. It adds the body and the date
 * to the title: «Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026». An override
 * stays as the admin wrote it. Pass `date: false` where the date is already
 * printed next to the label.
 */
export function meetingLabel(
    meeting: MeetingNameFields,
    locale: string,
    timezone: string,
    { date = true }: { date?: boolean } = {},
): string {
    const set = override(meeting, locale);
    if (set) return set;
    const title = derivedTitle(meeting, locale, timezone);
    const body = meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null;
    return [body, title.text, date && !title.dated ? meetingDate(meeting, locale, timezone) : null]
        .filter((part): part is string => !!part)
        .join(' · ');
}

/** `meetingLabel` for a row that carries the timezone of its city. */
export function meetingLabelInCity(
    meeting: MeetingNameFields & { city: { timezone: string } },
    locale: string,
    options?: { date?: boolean },
): string {
    return meetingLabel(meeting, locale, meeting.city.timezone, options);
}

/**
 * Whether a name is one that the platform derives for this meeting: its
 * label or its title, with or without the date. Such a name is no override.
 * The API returns the label in `name`, so a client that writes back the name
 * it read would otherwise freeze the body and the date of today.
 */
export function isDerivedName(name: string, meeting: MeetingNameFields, locale: string, timezone: string): boolean {
    const derived = { ...meeting, name: null, name_en: null };
    const forms = [
        meetingDisplayName(derived, locale, timezone),
        meetingLabel(derived, locale, timezone),
        meetingLabel(derived, locale, timezone, { date: false }),
    ];
    return forms.includes(name.trim());
}

"use client";

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MeetingFactsChange, MeetingFactsReading, StatedRollCallEntry } from '@/lib/apiTypes';
import type { MeetingFactSource } from '@/components/meetings/decisions/useMeetingFactSources';

interface SheetReviewSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cityId: string;
    meetingId: string;
    /** The sheet's row, with the reading to review. */
    source: MeetingFactSource;
    /** The city's people, for the person of each entry. */
    people: Array<{ id: string; name: string }>;
    /** The route accepted the reading; the row is what it stored. */
    onSaved: (row: MeetingFactSource, confirmed: boolean) => void;
}

type ChangeType = MeetingFactsChange['type'];
type Timing = NonNullable<MeetingFactsChange['anchor']['timing']>;

const CHANGE_TYPES: ChangeType[] = ['arrival', 'departure', 'absent_for_vote'];
const TIMINGS: Timing[] = ['before', 'during', 'after'];

const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const headingClass = 'text-[11px] font-extrabold tracking-[.04em] text-muted-foreground';

/** The reading as the row stores it, or an empty one when the row has none to edit. */
function readingOf(source: MeetingFactSource): MeetingFactsReading {
    return source.reading ?? { rollCall: null, attendanceChanges: [], votes: [], presidedBy: null, nameMatches: [], unmatchedNames: [], warnings: [] };
}

/**
 * The review of a sheet's reading (issue #807): the sheet's own image beside
 * what the reader read from it, editable. The reviewer corrects the person,
 * the status and the justification of each roll-call entry, and the arrivals
 * and departures; the vote statements are shown as read, because a sheet
 * rarely carries any.
 *
 * The reading is edited in place and sent back whole, so a field this form
 * does not show (the raw text of the roll call, the name matches, the
 * reader's warnings) reaches the route as it came.
 */
export function SheetReviewSheet({ open, onOpenChange, cityId, meetingId, source, people, onSaved }: SheetReviewSheetProps) {
    const t = useTranslations('admin.decisionsPage.sources.review');
    const [draft, setDraft] = useState<MeetingFactsReading>(() => readingOf(source));
    const [busy, setBusy] = useState<'save' | 'confirm' | null>(null);
    const [error, setError] = useState<string | null>(null);

    // A fresh draft for every opening and for every new version of the row. Keyed on
    // the row's version, not the object: the page refetches the sources while a
    // read is pending, and a new object for the same reading must not drop the edits.
    useEffect(() => {
        if (open) { setDraft(readingOf(source)); setError(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, source.id, source.updatedAt]);

    const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);
    const fileUrl = `/api/cities/${cityId}/meetings/${meetingId}/sheet?file=1&v=${encodeURIComponent(source.updatedAt)}`;
    const isPdf = source.mediaType === 'application/pdf';

    const updateEntry = (index: number, patch: Partial<StatedRollCallEntry>) => setDraft(prev => {
        if (!prev.rollCall) return prev;
        const entries = prev.rollCall.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        return { ...prev, rollCall: { ...prev.rollCall, entries } };
    });

    const updateChange = (index: number, patch: Partial<MeetingFactsChange>) => setDraft(prev => ({
        ...prev,
        attendanceChanges: prev.attendanceChanges.map((change, i) => (i === index ? { ...change, ...patch } : change)),
    }));

    const removeChange = (index: number) => setDraft(prev => ({
        ...prev,
        attendanceChanges: prev.attendanceChanges.filter((_, i) => i !== index),
    }));

    const submit = async (confirm: boolean) => {
        setBusy(confirm ? 'confirm' : 'save');
        setError(null);
        try {
            const response = await fetch(`/api/cities/${cityId}/meetings/${meetingId}/sheet`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reading: draft, confirm }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => null) as { error?: string } | null;
                throw new Error(body?.error ?? `HTTP ${response.status}`);
            }
            const data = await response.json() as { source: MeetingFactSource };
            onSaved(data.source, confirm);
            onOpenChange(false);
        } catch (e) {
            setError(t('saveFailed', { error: e instanceof Error ? e.message : String(e) }));
        } finally {
            setBusy(null);
        }
    };

    const personSelect = (value: string | null, onChange: (personId: string | null) => void, label: string) => (
        <select aria-label={label} className={selectClass} value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
            <option value="">{t('nobody')}</option>
            {sortedPeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
    );

    const typeLabels: Record<ChangeType, string> = {
        arrival: t('type.arrival'),
        departure: t('type.departure'),
        absent_for_vote: t('type.absent_for_vote'),
    };
    const timingLabels: Record<Timing, string> = {
        before: t('timingValue.before'),
        during: t('timingValue.during'),
        after: t('timingValue.after'),
    };
    const outcomeLabel = (outcome: MeetingFactsReading['votes'][number]['outcome']) => {
        if (outcome === 'unanimous') return t('outcome.unanimous');
        if (outcome === 'majority') return t('outcome.majority');
        if (outcome === 'rejected') return t('outcome.rejected');
        return t('outcome.none');
    };

    const entries = draft.rollCall?.entries ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-5xl">
                <SheetHeader>
                    <SheetTitle>{t('title')}</SheetTitle>
                    <SheetDescription>{t('description')}</SheetDescription>
                </SheetHeader>
                <div className="grid flex-1 gap-4 lg:grid-cols-2">
                    <div className="min-h-[320px] lg:sticky lg:top-0 lg:h-[75vh]">
                        {isPdf ? (
                            <iframe title={t('fileTitle')} src={fileUrl} className="h-full min-h-[320px] w-full rounded border" />
                        ) : (
                            <div className="h-full min-h-[320px] overflow-auto rounded border">
                                {/* The route serves the sheet's own image, which next/image cannot optimize. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={fileUrl} alt={t('fileTitle')} className="w-full" />
                            </div>
                        )}
                    </div>
                    <div className="space-y-4 text-xs">
                        <section>
                            <div className={headingClass}>{t('rollCall')}</div>
                            {entries.length === 0 ? (
                                <p className="mt-1 text-muted-foreground">{t('rollCallEmpty')}</p>
                            ) : (
                                <table className="mt-1.5 w-full border-collapse">
                                    <thead>
                                        <tr className="text-left text-[11px] text-muted-foreground">
                                            <th className="pb-1 pr-2 font-medium">{t('colName')}</th>
                                            <th className="pb-1 pr-2 font-medium">{t('colPerson')}</th>
                                            <th className="pb-1 pr-2 font-medium">{t('colStatus')}</th>
                                            <th className="pb-1 font-medium">{t('colJustified')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((entry, i) => {
                                            const present = entry.status === 'PRESENT';
                                            return (
                                                <tr key={i} className="border-t align-middle">
                                                    <td className="py-1 pr-2">
                                                        <span className="block">{entry.name}</span>
                                                        {entry.line !== null && <span className="block text-[11px] text-muted-foreground">{t('line', { line: entry.line })}</span>}
                                                    </td>
                                                    <td className="py-1 pr-2">
                                                        {personSelect(entry.personId, personId => updateEntry(i, { personId }), `${t('colPerson')} ${entry.name}`)}
                                                    </td>
                                                    <td className="py-1 pr-2">
                                                        <button
                                                            type="button"
                                                            aria-pressed={present}
                                                            aria-label={`${t('colStatus')} ${entry.name}`}
                                                            onClick={() => updateEntry(i, { status: present ? 'ABSENT' : 'PRESENT' })}
                                                            className={cn(
                                                                'rounded-md border px-2 py-1 text-xs',
                                                                present ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400' : 'border-destructive/40 text-destructive',
                                                            )}
                                                        >
                                                            {present ? t('present') : t('absent')}
                                                        </button>
                                                    </td>
                                                    <td className="py-1">
                                                        <Checkbox
                                                            aria-label={`${t('colJustified')} ${entry.name}`}
                                                            checked={entry.absenceJustified === true}
                                                            disabled={present}
                                                            onCheckedChange={checked => updateEntry(i, { absenceJustified: checked === true })}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </section>
                        <section>
                            <div className={headingClass}>{t('changes')}</div>
                            {draft.attendanceChanges.length === 0 ? (
                                <p className="mt-1 text-muted-foreground">{t('changesEmpty')}</p>
                            ) : (
                                <ul className="mt-1.5 space-y-2">
                                    {draft.attendanceChanges.map((change, i) => (
                                        <li key={i} className="rounded-md border p-2">
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {personSelect(change.personId, personId => updateChange(i, { personId }), `${t('colPerson')} ${i + 1}`)}
                                                <select
                                                    aria-label={`${t('colType')} ${i + 1}`}
                                                    className={selectClass}
                                                    value={change.type}
                                                    onChange={event => updateChange(i, { type: event.target.value as ChangeType })}
                                                >
                                                    {CHANGE_TYPES.map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}
                                                </select>
                                                <label className="flex items-center gap-1.5">
                                                    <span className="shrink-0 text-[11px] text-muted-foreground">{t('agendaItem')}</span>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        className="h-8 text-xs md:text-xs"
                                                        value={change.anchor.agendaItemIndex ?? ''}
                                                        onChange={event => {
                                                            const value = event.target.value === '' ? null : Number(event.target.value);
                                                            // A number typed in names an agenda item, whatever the reader anchored the change to.
                                                            updateChange(i, { anchor: { ...change.anchor, agendaItemIndex: value, ...(value !== null ? { kind: 'agenda_item' as const } : {}) } });
                                                        }}
                                                    />
                                                </label>
                                                <label className="flex items-center gap-1.5">
                                                    <span className="shrink-0 text-[11px] text-muted-foreground">{t('timing')}</span>
                                                    <select
                                                        className={selectClass}
                                                        value={change.anchor.timing ?? ''}
                                                        onChange={event => updateChange(i, { anchor: { ...change.anchor, timing: (event.target.value || null) as Timing | null } })}
                                                    >
                                                        <option value="">{t('timingNone')}</option>
                                                        {TIMINGS.map(timing => <option key={timing} value={timing}>{timingLabels[timing]}</option>)}
                                                    </select>
                                                </label>
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <Input
                                                    aria-label={`${t('rawText')} ${i + 1}`}
                                                    className="h-8 text-xs md:text-xs"
                                                    placeholder={t('rawText')}
                                                    value={change.rawText}
                                                    onChange={event => updateChange(i, { rawText: event.target.value })}
                                                />
                                                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => removeChange(i)}>
                                                    <X className="h-3.5 w-3.5" />
                                                    <span className="sr-only">{t('removeChange')}</span>
                                                </Button>
                                            </div>
                                            {change.line !== null && <div className="mt-1 text-[11px] text-muted-foreground">{t('line', { line: change.line })}</div>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        <section>
                            <div className={headingClass}>{t('votes')}</div>
                            {draft.votes.length === 0 ? (
                                <p className="mt-1 text-muted-foreground">{t('votesEmpty')}</p>
                            ) : (
                                <ul className="mt-1.5 space-y-1.5">
                                    {draft.votes.map((vote, i) => (
                                        <li key={i} className="rounded-md border p-2">
                                            <div className="font-medium">{outcomeLabel(vote.outcome)}</div>
                                            {vote.rawText && <div className="text-muted-foreground">{`«${vote.rawText}»`}</div>}
                                            {vote.line !== null && <div className="text-[11px] text-muted-foreground">{t('line', { line: vote.line })}</div>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy !== null}>{t('cancel')}</Button>
                    <Button variant="outline" onClick={() => { void submit(false); }} disabled={busy !== null}>
                        {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('save')}
                    </Button>
                    <Button onClick={() => { void submit(true); }} disabled={busy !== null}>
                        {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('confirm')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

"use client"

import { useState, useEffect, useCallback } from 'react';
import { Decision } from '@prisma/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { ExternalLink, Trash2, Save, FileCheck, FileX, RefreshCw, Loader2, Download } from 'lucide-react';
import { requestPollDecisions } from '@/lib/tasks/pollDecisions';

interface DecisionsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DecisionsPanel({ open, onOpenChange }: DecisionsPanelProps) {
    const { toast } = useToast();
    const { subjects, meeting, city } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const [decisions, setDecisions] = useState<Record<string, Decision>>({});
    const [editState, setEditState] = useState<Record<string, { pdfUrl: string; protocolNumber: string; ada: string }>>({});
    const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    const fetchDecisions = useCallback(async () => {
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`);
            if (!response.ok) return;
            const data: Decision[] = await response.json();
            const map: Record<string, Decision> = {};
            for (const d of data) {
                map[d.subjectId] = d;
            }
            setDecisions(map);
        } catch {
            // silent
        }
    }, [meeting.cityId, meeting.id]);

    useEffect(() => {
        if (open) {
            fetchDecisions();
        }
    }, [open, fetchDecisions]);

    const handleSave = async (subjectId: string) => {
        const edit = editState[subjectId];
        if (!edit?.pdfUrl) return;

        setSavingSubjectId(subjectId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjectId,
                    pdfUrl: edit.pdfUrl,
                    protocolNumber: edit.protocolNumber || undefined,
                    ada: edit.ada || undefined,
                }),
            });

            if (!response.ok) throw new Error('Failed to save decision');

            const decision: Decision = await response.json();
            setDecisions(prev => ({ ...prev, [subjectId]: decision }));
            setEditState(prev => {
                const next = { ...prev };
                delete next[subjectId];
                return next;
            });
            toast({ title: t('toasts.decisionLinked.title') });
        } catch (error) {
            toast({ title: t('toasts.errorSavingDecision.title'), description: `${error}`, variant: 'destructive' });
        } finally {
            setSavingSubjectId(null);
        }
    };

    const handleRemove = async (subjectId: string) => {
        try {
            const response = await fetch(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions?subjectId=${subjectId}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error('Failed to remove decision');

            setDecisions(prev => {
                const next = { ...prev };
                delete next[subjectId];
                return next;
            });
            toast({ title: t('toasts.decisionUnlinked.title') });
        } catch (error) {
            toast({ title: t('toasts.errorRemovingDecision.title'), description: `${error}`, variant: 'destructive' });
        }
    };

    const updateEdit = (subjectId: string, field: 'pdfUrl' | 'protocolNumber' | 'ada', value: string) => {
        setEditState(prev => ({
            ...prev,
            [subjectId]: {
                pdfUrl: prev[subjectId]?.pdfUrl ?? '',
                protocolNumber: prev[subjectId]?.protocolNumber ?? '',
                ada: prev[subjectId]?.ada ?? '',
                [field]: value,
            },
        }));
    };

    const handleExport = () => {
        // Only export subjects with agendaItemIndex (eligible for decisions)
        const subjectsToExport = subjects.filter(s => s.agendaItemIndex != null);
        const exportData = {
            meeting: {
                date: meeting.dateTime.toISOString().split('T')[0],
                diavgeiaOrgUid: city.diavgeiaUid,
                diavgeiaUnitId: meeting.administrativeBody?.diavgeiaUnitId,
                administrativeBody: meeting.administrativeBody?.name,
                cityId: meeting.cityId,
                meetingId: meeting.id,
            },
            subjects: subjectsToExport.map(s => ({
                subjectId: s.id,
                name: s.name,
                agendaItemIndex: s.agendaItemIndex,
                knownAda: decisions[s.id]?.ada || null,
            })),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-${meeting.id}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Only subjects with agendaItemIndex can have decisions
    const eligibleSubjects = subjects.filter(s => s.agendaItemIndex != null);
    const linkedCount = eligibleSubjects.filter(s => decisions[s.id]).length;
    const unlinkedSubjectIds = eligibleSubjects
        .filter(s => !decisions[s.id])
        .map(s => s.id);

    const handlePollDecisions = async (onlyUnlinked: boolean) => {
        setIsPolling(true);
        try {
            const subjectIds = onlyUnlinked ? unlinkedSubjectIds : undefined;
            await requestPollDecisions(meeting.cityId, meeting.id, subjectIds);
            toast({
                title: t('toasts.pollDecisionsRequested.title'),
                description: t('toasts.pollDecisionsRequested.description'),
            });
        } catch (error) {
            toast({
                title: t('toasts.errorPollingDecisions.title'),
                description: `${error}`,
                variant: 'destructive'
            });
        } finally {
            setIsPolling(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {t('decisions.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('decisions.description')}
                    </DialogDescription>
                </DialogHeader>

                {/* Summary and Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileCheck className="h-4 w-4" />
                        <span>{linkedCount} / {eligibleSubjects.length} {t('decisions.linked')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            {t('decisions.exportForMatching')}
                        </Button>
                        {unlinkedSubjectIds.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePollDecisions(true)}
                                disabled={isPolling}
                            >
                                {isPolling ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                {t('decisions.pollUnlinked', { count: unlinkedSubjectIds.length })}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePollDecisions(false)}
                            disabled={isPolling}
                        >
                            {isPolling ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            {t('decisions.pollAll')}
                        </Button>
                    </div>
                </div>

                {/* Subjects List */}
                <div className="space-y-4 py-4">
                    {eligibleSubjects.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {t('decisions.noSubjects')}
                        </div>
                    ) : (
                        eligibleSubjects.map(subject => {
                            const decision = decisions[subject.id];
                            const edit = editState[subject.id];
                            const isSaving = savingSubjectId === subject.id;

                            return (
                                <div
                                    key={subject.id}
                                    className="border rounded-lg p-4 space-y-3 hover:bg-gray-50 transition-colors"
                                >
                                    {/* Subject Header */}
                                    <div className="flex items-start justify-between gap-2">
                                        <h5 className="font-medium text-gray-900 flex-1">
                                            {subject.agendaItemIndex != null && `#${subject.agendaItemIndex} `}
                                            {subject.name}
                                        </h5>
                                        {decision ? (
                                            <Badge variant="default" className="shrink-0 bg-green-600">
                                                <FileCheck className="h-3 w-3 mr-1" />
                                                {decision.ada || decision.protocolNumber || t('decisions.viewPdf')}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="shrink-0">
                                                <FileX className="h-3 w-3 mr-1" />
                                                {t('decisions.noDecision')}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Decision Link / Edit */}
                                    {decision && !edit ? (
                                        <div className="flex items-center gap-2 text-sm">
                                            <a
                                                href={decision.pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                {decision.pdfUrl}
                                            </a>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemove(subject.id)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                placeholder={t('decisions.pdfUrlPlaceholder')}
                                                value={edit?.pdfUrl ?? ''}
                                                onChange={e => updateEdit(subject.id, 'pdfUrl', e.target.value)}
                                                className="text-sm"
                                            />
                                            <Input
                                                placeholder={t('decisions.adaPlaceholder')}
                                                value={edit?.ada ?? ''}
                                                onChange={e => updateEdit(subject.id, 'ada', e.target.value)}
                                                className="text-sm w-36"
                                            />
                                            <Input
                                                placeholder={t('decisions.protocolNumberPlaceholder')}
                                                value={edit?.protocolNumber ?? ''}
                                                onChange={e => updateEdit(subject.id, 'protocolNumber', e.target.value)}
                                                className="text-sm w-28"
                                            />
                                            <Button
                                                size="sm"
                                                disabled={!edit?.pdfUrl || isSaving}
                                                onClick={() => handleSave(subject.id)}
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                ) : (
                                                    <Save className="h-3 w-3 mr-1" />
                                                )}
                                                {t('decisions.save')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

"use client";
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { ACTIONS, useKeyboardShortcut } from '@/contexts/KeyboardShortcutsContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface EditingContextType {
    selectedUtteranceIds: Set<string>;
    lastClickedUtteranceId: string | null;
    toggleSelection: (id: string, modifiers: { shift: boolean, ctrl: boolean }) => void;
    clearSelection: () => void;
    extractSelectedSegment: () => Promise<void>;
    isProcessing: boolean;
}

const EditingContext = createContext<EditingContextType | undefined>(undefined);

export function EditingProvider({ children }: { children: ReactNode }) {
    const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
    const [lastClickedUtteranceId, setLastClickedUtteranceId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const { transcript, extractSpeakerSegment } = useCouncilMeetingData();
    const { toast } = useToast();
    const t = useTranslations('editing.toasts');

    // Flatten utterances for easy range index finding
    // Memoizing this might be expensive if transcript changes often, but necessary for range selection
    const allUtterances = React.useMemo(() => {
        return transcript.flatMap(segment => segment.utterances);
    }, [transcript]);

    const clearSelection = useCallback(() => {
        setSelectedUtteranceIds(new Set());
        setLastClickedUtteranceId(null);
    }, []);

    const toggleSelection = useCallback((id: string, modifiers: { shift: boolean, ctrl: boolean }) => {
        setSelectedUtteranceIds(prev => {
            const newSet = new Set(prev);

            if (modifiers.shift && lastClickedUtteranceId) {
                // Range selection
                const startIndex = allUtterances.findIndex(u => u.id === lastClickedUtteranceId);
                const endIndex = allUtterances.findIndex(u => u.id === id);

                if (startIndex !== -1 && endIndex !== -1) {
                    const start = Math.min(startIndex, endIndex);
                    const end = Math.max(startIndex, endIndex);
                    
                    // We clear previous selection if shift-clicking usually? 
                    // Standard behavior: Shift+Click extends selection from anchor.
                    // For simplicity here: Add range to existing selection.
                    for (let i = start; i <= end; i++) {
                        newSet.add(allUtterances[i].id);
                    }
                }
            } else if (modifiers.ctrl) {
                // Toggle individual
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
                setLastClickedUtteranceId(id);
            } else {
                // Single select (clear others)
                // Unless we clicked the same one, then maybe deselect? No, standard is keep selected.
                newSet.clear();
                newSet.add(id);
                setLastClickedUtteranceId(id);
            }

            return newSet;
        });
    }, [allUtterances, lastClickedUtteranceId]);

    const extractSelectedSegment = useCallback(async () => {
        if (selectedUtteranceIds.size === 0) return;
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            // 1. Identify the segment(s) involved. 
            // Current logic only supports extracting from a SINGLE segment.
            // We need to verify all selected utterances belong to the SAME segment.
            
            const selectedList = Array.from(selectedUtteranceIds);
            const firstUtterance = allUtterances.find(u => u.id === selectedList[0]);
            if (!firstUtterance) throw new Error("Selected utterance not found");

            const targetSegmentId = firstUtterance.speakerSegmentId;
            
            // Validate all in same segment
            const allInSame = selectedList.every(id => {
                const u = allUtterances.find(ut => ut.id === id);
                return u && u.speakerSegmentId === targetSegmentId;
            });

            if (!allInSame) {
                toast({
                    title: t('selectionErrorTitle'),
                    description: t('selectionErrorDiffSegments'),
                    variant: "destructive"
                });
                return;
            }

            // Find start and end utterance IDs (chronologically)
            // We rely on the order in allUtterances
            const indices = selectedList
                .map(id => allUtterances.findIndex(u => u.id === id))
                .sort((a, b) => a - b);
            
            // Verify continuity (optional? A-B-A pattern implies we take a chunk. What if they selected 1, 3, 5? 
            // Logic in backend splits by range. So if they select 1 and 3, backend slice(1, 3) would include 2.
            // Let's assume range defined by min/max index.
            
            const startUtteranceId = allUtterances[indices[0]].id;
            const endUtteranceId = allUtterances[indices[indices.length - 1]].id;

            // Verify that extraction won't leave a segment empty
            // We need to know how many utterances are in the original segment
            const originalSegment = transcript.find(s => s.id === targetSegmentId);
            if (originalSegment) {
                const totalUtterances = originalSegment.utterances.length;
                
                // Find the start index of the selection relative to the segment
                // originalSegment.utterances is ordered by timestamp? 
                // It should be, but let's be safe and find index of startUtteranceId
                const segmentStartIndex = originalSegment.utterances.findIndex(u => u.id === startUtteranceId);
                // And end index
                const segmentEndIndex = originalSegment.utterances.findIndex(u => u.id === endUtteranceId);
                
                const extractionCount = segmentEndIndex - segmentStartIndex + 1;

                // Prevent extracting ALL utterances (no Before, no After)
                if (extractionCount === totalUtterances) {
                     toast({
                        title: t('invalidOperationTitle'),
                        description: t('invalidOperationExtractAll'),
                        variant: "destructive"
                    });
                    return;
                }

                // Prevent extracting from the START (no Before)
                if (segmentStartIndex === 0) {
                    toast({
                        title: t('invalidOperationTitle'),
                        description: t('invalidOperationExtractStartEnd'),
                        variant: "destructive"
                    });
                    return;
                }

                // Prevent extracting from the END (no After)
                if (segmentEndIndex === totalUtterances - 1) {
                    toast({
                        title: t('invalidOperationTitle'),
                        description: t('invalidOperationExtractStartEnd'),
                        variant: "destructive"
                    });
                    return;
                }
            }

            await extractSpeakerSegment(targetSegmentId, startUtteranceId, endUtteranceId);
            
            clearSelection();
            toast({
                description: t('extractionSuccess')
            });

        } catch (error) {
            console.error(error);
            toast({
                title: "Error", // Common error title often not localized or "Error" is fine fallback, but ideally localized
                description: t('extractionError'),
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
        }
    }, [selectedUtteranceIds, isProcessing, allUtterances, extractSpeakerSegment, clearSelection, toast, transcript, t]);

    // Register Shortcuts
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, extractSelectedSegment, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, clearSelection, selectedUtteranceIds.size > 0);

    return (
        <EditingContext.Provider value={{
            selectedUtteranceIds,
            lastClickedUtteranceId,
            toggleSelection,
            clearSelection,
            extractSelectedSegment,
            isProcessing
        }}>
            {children}
        </EditingContext.Provider>
    );
}

export function useEditing() {
    const context = useContext(EditingContext);
    if (context === undefined) {
        throw new Error('useEditing must be used within an EditingProvider');
    }
    return context;
}

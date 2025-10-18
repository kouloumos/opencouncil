"use client";

import { GenericTranscriptDataProvider, useGenericTranscript } from './GenericTranscriptContext';
import { CouncilMeetingDataProvider } from '../meetings/CouncilMeetingDataContext';
import { VideoProvider } from '../meetings/VideoProvider';
import { TranscriptOptionsProvider } from '../meetings/options/OptionsContext';
import { HighlightProvider } from '../meetings/HighlightContext';
import { EditingProvider } from '../meetings/EditingContext';
import { KeyboardShortcutsProvider } from '@/contexts/KeyboardShortcutsContext';
import { KeyboardShortcuts } from '../meetings/KeyboardShortcuts';
import { ShareProvider } from '@/contexts/ShareContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import Transcript from '../meetings/transcript/Transcript';
import TranscriptControls from '../meetings/TranscriptControls';
import EditButton from '../meetings/EditButton';
import { EditingModeBar } from '../meetings/EditingModeBar';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { SpeakerTag, Transcript as PrismaTranscript } from '@prisma/client';
import { useMemo, useState } from 'react';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface GenericTranscriptData {
  transcript: TranscriptType;
  speakerTags: SpeakerTag[];
  transcriptMeta: PrismaTranscript;
  workspaceId: string;
  transcriptId: string;
  editable: boolean;
}

interface GenericTranscriptWrapperProps {
  data: GenericTranscriptData;
}

// Adapter component to bridge generic context to council context
function ContextBridge({ children, speakerTags }: { children: React.ReactNode, speakerTags: SpeakerTag[] }) {
  const genericContext = useGenericTranscript();
  
  // Adapt generic context to match council context shape
  const councilContextData = useMemo(() => ({
    ...genericContext,
    meeting: {
      ...genericContext.transcriptData,
      id: genericContext.transcriptId,
      cityId: genericContext.workspaceId, // For API compatibility, though it's actually a workspaceId
    },
    city: { id: genericContext.workspaceId, name: '' },
    subjects: [],
    highlights: [],
    parties: [],
    speakerTags, // Pass the actual speaker tags
    taskStatus: { humanReview: true }, // Generic transcripts are considered verified by default
    getSpeakerTag: (speakerTagId: string) => speakerTags.find(tag => tag.id === speakerTagId),
    getParty: () => undefined,
    getPersonsForParty: () => [],
    getHighlight: () => undefined,
    addHighlight: () => {},
    updateHighlight: () => {},
    removeHighlight: () => {},
  }), [genericContext, speakerTags]);
  
  return (
    <CouncilMeetingDataProvider data={councilContextData as any}>
      {children}
    </CouncilMeetingDataProvider>
  );
}

export function GenericTranscriptWrapper({ data }: GenericTranscriptWrapperProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const t = useTranslations('workspaces.transcript');
  const tCommon = useTranslations('workspaces.common');

  const utterances = useMemo(() => {
    return data.transcript.map(seg => seg.utterances).flat();
  }, [data.transcript]);

  // Create a meeting-like object for VideoProvider
  const meeting = useMemo(() => ({
    id: data.transcriptId,
    name: data.transcriptMeta.name,
    transcript: {
      muxPlaybackId: data.transcriptMeta.muxPlaybackId,
      videoUrl: data.transcriptMeta.videoUrl,
    }
  }), [data.transcriptId, data.transcriptMeta]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/workspaces/${data.workspaceId}/transcripts/${data.transcriptId}/export/docx`
      );

      if (!response.ok) {
        throw new Error('Failed to export transcript');
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.transcriptMeta.name}_transcript.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: tCommon('success'),
        description: t('exportSuccess')
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: tCommon('error'),
        description: t('exportError'),
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TooltipProvider>
      <GenericTranscriptDataProvider
        transcript={data.transcript}
        speakerTags={data.speakerTags}
        transcriptMeta={data.transcriptMeta}
        workspaceId={data.workspaceId}
        transcriptId={data.transcriptId}
        editable={data.editable}
      >
        <ContextBridge speakerTags={data.speakerTags}>
          <ShareProvider>
            <TranscriptOptionsProvider editable={data.editable}>
              <VideoProvider
                meeting={meeting as any}
                utterances={utterances}
              >
                <HighlightProvider>
                  <KeyboardShortcutsProvider>
                    <EditingProvider>
                      <KeyboardShortcuts />
                      <div className="flex flex-col h-screen">
                      {/* Header with back button, title, and actions */}
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/workspaces/${data.workspaceId}`)}
                          className="flex-shrink-0"
                        >
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          {tCommon('back')}
                        </Button>
                        <h1 className="text-lg font-semibold truncate">
                          {data.transcriptMeta.name}
                        </h1>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleExport}
                          disabled={isExporting}
                        >
                          {isExporting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t('exporting')}
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-2" />
                              {t('export')}
                            </>
                          )}
                        </Button>
                        {data.editable && <EditButton />}
                      </div>
                    </div>
                    <EditingModeBar />
                    <div className="flex-1 flex min-h-0">
                      <div className="flex-1 overflow-auto">
                        <div className="pb-20">
                          <Transcript />
                        </div>
                        {data.transcriptMeta.muxPlaybackId && <TranscriptControls />}
                      </div>
                        </div>
                      </div>
                    </EditingProvider>
                  </KeyboardShortcutsProvider>
                </HighlightProvider>
              </VideoProvider>
            </TranscriptOptionsProvider>
          </ShareProvider>
        </ContextBridge>
      </GenericTranscriptDataProvider>
    </TooltipProvider>
  );
}


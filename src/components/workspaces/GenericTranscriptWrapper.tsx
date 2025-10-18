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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Transcript from '../meetings/transcript/Transcript';
import TranscriptControls from '../meetings/TranscriptControls';
import EditButton from '../meetings/EditButton';
import { EditingModeBar } from '../meetings/EditingModeBar';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { SpeakerTag, Transcript as PrismaTranscript } from '@prisma/client';
import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, Download, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface GenericTranscriptData {
  transcript: TranscriptType;
  speakerTags: SpeakerTag[];
  transcriptMeta: PrismaTranscript;
  latestTask: {
    id: string;
    status: string;
    type: string;
    stage: string | null;
    percentComplete: number | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
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
  const [currentTask, setCurrentTask] = useState(data.latestTask);
  const t = useTranslations('workspaces.transcript');
  const tCommon = useTranslations('workspaces.common');
  const tDashboard = useTranslations('workspaces.dashboard');

  const utterances = useMemo(() => {
    return data.transcript.map(seg => seg.utterances).flat();
  }, [data.transcript]);

  // Poll for task status updates when pending
  useEffect(() => {
    if (currentTask?.status !== 'pending') return;
    
    const pollTaskStatus = async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${data.workspaceId}/transcripts/${data.transcriptId}`
        );
        if (response.ok) {
          const transcriptData = await response.json();
          const latestTask = transcriptData.taskStatuses?.[0] || null;
          setCurrentTask(latestTask);
          
          // If task completed successfully, refresh the page to load the transcript
          if (latestTask?.status === 'succeeded') {
            router.refresh();
          }
        }
      } catch (error) {
        console.error('Failed to poll task status:', error);
      }
    };
    
    const interval = setInterval(pollTaskStatus, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [currentTask?.status, data.workspaceId, data.transcriptId, router]);

  // Check if transcript is empty (not transcribed yet)
  const isTranscriptEmpty = data.transcript.length === 0;

  // Create a meeting-like object for VideoProvider
  const meeting = useMemo(() => ({
    id: data.transcriptId,
    name: data.transcriptMeta.name,
    transcript: {
      muxPlaybackId: data.transcriptMeta.muxPlaybackId,
      videoUrl: data.transcriptMeta.videoUrl,
    }
  }), [data.transcriptId, data.transcriptMeta]);

  const renderTaskStatus = () => {
    if (!currentTask) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{t('noTranscript')}</CardTitle>
            <CardDescription>{t('noTranscriptDescription')}</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const { status, type, stage, percentComplete } = currentTask;

    if (status === 'pending') {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
              <div>
                <CardTitle className="text-yellow-600">
                  {type === 'transcribe' ? tDashboard('transcribing') : 'Processing'}
                </CardTitle>
                <CardDescription>
                  {stage && <span className="block mt-1">{stage}</span>}
                  {percentComplete !== null && (
                    <span className="block mt-1">{Math.round(percentComplete)}% complete</span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('transcriptionInProgress')}
            </p>
          </CardContent>
        </Card>
      );
    }

    if (status === 'failed') {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <XCircle className="w-6 h-6 text-red-500" />
              <div>
                <CardTitle className="text-red-600">{tDashboard('failed')}</CardTitle>
                <CardDescription>{t('transcriptionFailed')}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      );
    }

    return null;
  };

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
            <TranscriptOptionsProvider editable={data.editable} isGenericMode={true}>
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
                        {isTranscriptEmpty ? (
                          <div className="container max-w-2xl mx-auto py-12">
                            {renderTaskStatus()}
                          </div>
                        ) : (
                          <>
                            <div className="pb-20">
                              <Transcript />
                            </div>
                            {data.transcriptMeta.muxPlaybackId && <TranscriptControls />}
                          </>
                        )}
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


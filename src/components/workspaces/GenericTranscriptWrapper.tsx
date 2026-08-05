"use client";

import CouncilMeetingWrapper from '../meetings/CouncilMeetingWrapper';
import { ShareProvider } from '@/contexts/ShareContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Transcript from '../meetings/transcript/Transcript';
import { PlaybackBar } from '../meetings/bar/PlaybackBar';
import EditButton from '../meetings/EditButton';
import { EditingModeBar } from '../meetings/EditingModeBar';
import type { MeetingData } from '@/lib/getMeetingData';
import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Loader2, XCircle } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface GenericTranscriptData {
  meetingData: MeetingData;
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

export function GenericTranscriptWrapper({ data }: GenericTranscriptWrapperProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [currentTask, setCurrentTask] = useState(data.latestTask);
  const t = useTranslations('workspaces.transcript');
  const tCommon = useTranslations('workspaces.common');
  const tDashboard = useTranslations('workspaces.dashboard');

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
  const { meeting } = data.meetingData;
  const isTranscriptEmpty = data.meetingData.transcript.length === 0;
  const hasPlayback = Boolean(meeting.muxPlaybackId || meeting.videoUrl || meeting.audioUrl);

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

  const handleExport = async (format: 'docx' | 'srt') => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/workspaces/${data.workspaceId}/transcripts/${data.transcriptId}/export/${format}`
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
      a.download = `${meeting.name ?? data.transcriptId}_transcript.${format}`;
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
      <ShareProvider>
        <CouncilMeetingWrapper
          meetingData={data.meetingData}
          editable={data.editable}
          canCreateHighlights={false}
          isGenericMode
        >
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
                          {meeting.name ?? data.transcriptId}
                        </h1>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
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
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExport('docx')}>
                              {t('exportDocx')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('srt')}>
                              {t('exportSrt')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {data.editable && <EditButton />}
                      </div>
                    </div>
                    <EditingModeBar />
                    <div className="flex-1 flex min-h-0">
                      {/* The same scroll frame as the meeting layout: the playback
                          dock and the transcript scroll read these attributes. */}
                      <div className="relative flex-1 overflow-auto" data-scroll-container>
                        {isTranscriptEmpty ? (
                          <div className="container max-w-2xl mx-auto py-12">
                            {renderTaskStatus()}
                          </div>
                        ) : (
                          <>
                            <div data-scroll-content className={hasPlayback ? 'pb-[var(--playback-dock-clearance)] max-md:pb-[calc(var(--playback-dock-clearance-mobile)+env(safe-area-inset-bottom))]' : undefined}>
                              <Transcript />
                            </div>
                            {hasPlayback && <PlaybackBar />}
                          </>
                        )}
                      </div>
                        </div>
                      </div>
        </CouncilMeetingWrapper>
      </ShareProvider>
    </TooltipProvider>
  );
}


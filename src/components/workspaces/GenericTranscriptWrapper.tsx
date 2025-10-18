"use client";

import { GenericTranscriptDataProvider, useGenericTranscript } from './GenericTranscriptContext';
import { CouncilMeetingDataProvider } from '../meetings/CouncilMeetingDataContext';
import { VideoProvider } from '../meetings/VideoProvider';
import { TranscriptOptionsProvider } from '../meetings/options/OptionsContext';
import { HighlightProvider } from '../meetings/HighlightContext';
import { ShareProvider } from '@/contexts/ShareContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import Transcript from '../meetings/transcript/Transcript';
import TranscriptControls from '../meetings/TranscriptControls';
// import EditSwitch from '../meetings/edit-switch';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { SpeakerTag, Transcript as PrismaTranscript } from '@prisma/client';
import { useMemo } from 'react';

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
    meeting: genericContext.transcriptData,
    city: { id: genericContext.workspaceId, name: '' },
    subjects: [],
    highlights: [],
    parties: [],
    speakerTags, // Pass the actual speaker tags
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
                  <div className="flex flex-col h-screen">
                    {/* Simple header with edit switch */}
                    {data.editable && (
                      <div className="flex items-center justify-end px-4 py-2 border-b bg-background">
                        {/* <EditSwitch /> */}
                      </div>
                    )}
                    <div className="flex-1 flex min-h-0">
                      <div className="flex-1 overflow-auto">
                        <div className="pb-20">
                          <Transcript />
                        </div>
                        {data.transcriptMeta.muxPlaybackId && <TranscriptControls />}
                      </div>
                    </div>
                  </div>
                </HighlightProvider>
              </VideoProvider>
            </TranscriptOptionsProvider>
          </ShareProvider>
        </ContextBridge>
      </GenericTranscriptDataProvider>
    </TooltipProvider>
  );
}


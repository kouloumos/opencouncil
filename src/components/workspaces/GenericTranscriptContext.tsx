"use client"
import React, { createContext, useContext, ReactNode, useMemo, useState, useCallback } from 'react';
import { SpeakerTag, Transcript as PrismaTranscript } from '@prisma/client';
import { Transcript } from '@/lib/db/transcript';

export interface GenericTranscriptContextValue {
  transcript: Transcript;
  transcriptData: PrismaTranscript;
  workspaceId: string;
  transcriptId: string;
  editable: boolean;
  people: any[]; // Empty for generic, populated for councils
  getPerson: (id: string) => any | undefined; // Returns undefined for generic
  getSpeakerTag: (id: string) => SpeakerTag | undefined;
  getSpeakerSegmentCount: (tagId: string) => number;
  getSpeakerSegmentById: (id: string) => Transcript[number] | undefined;
  updateSpeakerTagPerson: (tagId: string, speakerId: string | null) => Promise<void>;
  updateSpeakerTagLabel: (tagId: string, label: string) => Promise<void>;
  createEmptySegmentAfter: (afterSegmentId: string) => Promise<void>;
  moveUtterancesToPrevious: (utteranceId: string, currentSegmentId: string) => Promise<void>;
  moveUtterancesToNext: (utteranceId: string, currentSegmentId: string) => Promise<void>;
  deleteEmptySegment: (segmentId: string) => Promise<void>;
}

const GenericTranscriptContext = createContext<GenericTranscriptContextValue | undefined>(undefined);

export function GenericTranscriptDataProvider({ 
  children,
  transcript: initialTranscript,
  speakerTags: initialSpeakerTags,
  transcriptMeta,
  workspaceId,
  transcriptId,
  editable
}: {
  children: ReactNode,
  transcript: Transcript,
  speakerTags: SpeakerTag[],
  transcriptMeta: PrismaTranscript,
  workspaceId: string,
  transcriptId: string,
  editable: boolean
}) {
  const [transcript, setTranscript] = useState<Transcript>(initialTranscript);
  const [speakerTags, setSpeakerTags] = useState<SpeakerTag[]>(initialSpeakerTags);

  const speakerTagsMap = useMemo(() => 
    new Map(speakerTags.map(tag => [tag.id, tag])), 
    [speakerTags]
  );
  
  const speakerSegmentsMap = useMemo(() => 
    new Map(transcript.map(segment => [segment.id, segment])), 
    [transcript]
  );

  // Create a map of speaker tag IDs to their segment counts
  const speakerTagSegmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    transcript.forEach(segment => {
      const count = counts.get(segment.speakerTag.id) || 0;
      counts.set(segment.speakerTag.id, count + 1);
    });
    return counts;
  }, [transcript]);

  const contextValue = useMemo(() => ({
    transcript,
    transcriptData: transcriptMeta,
    workspaceId,
    transcriptId,
    editable,
    people: [], // No people in generic workspaces
    getPerson: (id: string) => undefined, // No persons in generic workspaces
    getSpeakerTag: (id: string) => speakerTagsMap.get(id),
    getSpeakerSegmentCount: (tagId: string) => speakerTagSegmentCounts.get(tagId) || 0,
    getSpeakerSegmentById: (id: string) => speakerSegmentsMap.get(id),
    
    updateSpeakerTagPerson: async (tagId: string, speakerId: string | null) => {
      console.log(`Updating speaker tag ${tagId} to speaker ${speakerId}`);
      
      // Call API to update
      const response = await fetch(`/api/speaker-tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update speaker tag');
      }
      
      // Update local state
      setSpeakerTags(prevTags =>
        prevTags.map(tag => tag.id === tagId ? { ...tag, speakerId } : tag)
      );
      setTranscript(prevTranscript =>
        prevTranscript.map(segment =>
          segment.speakerTagId === tagId
            ? { ...segment, speakerTag: { ...segment.speakerTag, speakerId } }
            : segment
        )
      );
    },
    
    updateSpeakerTagLabel: async (tagId: string, label: string) => {
      // Call API to update
      const response = await fetch(`/api/speaker-tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update speaker tag');
      }
      
      // Update local state
      setSpeakerTags(prevTags =>
        prevTags.map(tag => tag.id === tagId ? { ...tag, label } : tag)
      );
      setTranscript(prevTranscript =>
        prevTranscript.map(segment =>
          segment.speakerTagId === tagId
            ? { ...segment, speakerTag: { ...segment.speakerTag, label } }
            : segment
        )
      );
    },
    
    createEmptySegmentAfter: async (afterSegmentId: string) => {
      const response = await fetch('/api/speaker-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterSegmentId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create segment');
      }
      
      const newSegment = await response.json();
      
      setTranscript(prevTranscript => {
        const index = prevTranscript.findIndex(s => s.id === afterSegmentId);
        if (index === -1) return prevTranscript;
        
        const before = prevTranscript.slice(0, index + 1);
        const after = prevTranscript.slice(index + 1);
        return [...before, newSegment as any, ...after];
      });
    },
    
    moveUtterancesToPrevious: async (utteranceId: string, currentSegmentId: string) => {
      const response = await fetch('/api/utterances/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utteranceId, currentSegmentId, direction: 'previous' })
      });
      
      if (!response.ok) {
        throw new Error('Failed to move utterances');
      }
      
      // Refetch transcript
      const transcriptResponse = await fetch(`/api/workspaces/${workspaceId}/transcripts/${transcriptId}/segments`);
      if (transcriptResponse.ok) {
        const updated = await transcriptResponse.json();
        setTranscript(updated);
      }
    },
    
    moveUtterancesToNext: async (utteranceId: string, currentSegmentId: string) => {
      const response = await fetch('/api/utterances/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utteranceId, currentSegmentId, direction: 'next' })
      });
      
      if (!response.ok) {
        throw new Error('Failed to move utterances');
      }
      
      // Refetch transcript
      const transcriptResponse = await fetch(`/api/workspaces/${workspaceId}/transcripts/${transcriptId}/segments`);
      if (transcriptResponse.ok) {
        const updated = await transcriptResponse.json();
        setTranscript(updated);
      }
    },
    
    deleteEmptySegment: async (segmentId: string) => {
      const response = await fetch(`/api/speaker-segments/${segmentId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete segment');
      }
      
      setTranscript(prevTranscript =>
        prevTranscript.filter(s => s.id !== segmentId)
      );
    }
  }), [transcript, transcriptMeta, workspaceId, transcriptId, editable, speakerTagsMap, speakerTagSegmentCounts, speakerSegmentsMap]);

  return (
    <GenericTranscriptContext.Provider value={contextValue}>
      {children}
    </GenericTranscriptContext.Provider>
  );
}

export function useGenericTranscript() {
  const context = useContext(GenericTranscriptContext);
  if (!context) {
    throw new Error('useGenericTranscript must be used within GenericTranscriptDataProvider');
  }
  return context;
}

// Compatibility alias for components that use useCouncilMeetingData
export const useCouncilMeetingData = useGenericTranscript;


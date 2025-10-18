"use server";

import { Prisma } from "@prisma/client";
import prisma from "./prisma";

// Define include objects with satisfies for type safety
const transcriptWithRelationsInclude = {
  workspace: true,
  speakerSegments: {
    include: {
      speakerTag: {
        include: {
          speaker: true
        }
      },
      utterances: {
        orderBy: { startTimestamp: 'asc' as const }
      }
    },
    orderBy: { startTimestamp: 'asc' as const }
  },
  taskStatuses: {
    orderBy: { createdAt: 'desc' as const }
  },
  councilMeeting: {
    include: {
      city: true,
      administrativeBody: true
    }
  }
} satisfies Prisma.TranscriptInclude;

const transcriptMinimalInclude = {
  workspace: {
    select: {
      id: true,
      name: true
    }
  },
  councilMeeting: {
    select: {
      dateTime: true,
      name_en: true
    }
  },
  _count: {
    select: {
      speakerSegments: true,
      taskStatuses: true
    }
  }
} satisfies Prisma.TranscriptInclude;

// Derive types from includes
export type TranscriptWithRelations = Prisma.TranscriptGetPayload<{ 
  include: typeof transcriptWithRelationsInclude 
}>;

export type TranscriptMinimal = Prisma.TranscriptGetPayload<{ 
  include: typeof transcriptMinimalInclude 
}>;

/**
 * Get a transcript by ID with all relations
 */
export async function getTranscript(
  workspaceId: string,
  transcriptId: string
): Promise<TranscriptWithRelations | null> {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { workspaceId_id: { workspaceId, id: transcriptId }},
      include: transcriptWithRelationsInclude
    });
    return transcript;
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Failed to fetch transcript');
  }
}

/**
 * Get a minimal transcript (just counts and basic info)
 */
export async function getTranscriptMinimal(
  workspaceId: string,
  transcriptId: string
): Promise<TranscriptMinimal | null> {
  try {
    const transcript = await prisma.transcript.findUnique({
      where: { workspaceId_id: { workspaceId, id: transcriptId }},
      include: transcriptMinimalInclude
    });
    return transcript;
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Failed to fetch transcript');
  }
}

/**
 * List transcripts in a workspace
 */
export async function listTranscripts(
  workspaceId: string,
  options: {
    released?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<TranscriptMinimal[]> {
  try {
    const transcripts = await prisma.transcript.findMany({
      where: {
        workspaceId,
        ...(options.released !== undefined && { released: options.released })
      },
      include: transcriptMinimalInclude,
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      skip: options.offset
    });
    return transcripts;
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    throw new Error('Failed to fetch transcripts');
  }
}

/**
 * Create a new transcript
 */
export async function createTranscript(data: {
  id?: string;
  workspaceId: string;
  name: string;
  videoUrl?: string;
  audioUrl?: string;
  muxPlaybackId?: string;
  released?: boolean;
}): Promise<TranscriptWithRelations> {
  try {
    const transcript = await prisma.transcript.create({
      data: {
        ...(data.id && { id: data.id }), // Only set ID if provided
        workspaceId: data.workspaceId,
        name: data.name,
        videoUrl: data.videoUrl,
        audioUrl: data.audioUrl,
        muxPlaybackId: data.muxPlaybackId,
        released: data.released ?? false,
      },
      include: transcriptWithRelationsInclude
    });
    return transcript;
  } catch (error) {
    console.error('Error creating transcript:', error);
    throw new Error('Failed to create transcript');
  }
}

/**
 * Update a transcript
 */
export async function updateTranscript(
  workspaceId: string,
  transcriptId: string,
  data: {
    name?: string;
    videoUrl?: string;
    audioUrl?: string;
    muxPlaybackId?: string;
    released?: boolean;
  }
): Promise<TranscriptWithRelations> {
  try {
    const transcript = await prisma.transcript.update({
      where: { workspaceId_id: { workspaceId, id: transcriptId }},
      data,
      include: transcriptWithRelationsInclude
    });
    return transcript;
  } catch (error) {
    console.error('Error updating transcript:', error);
    throw new Error('Failed to update transcript');
  }
}

/**
 * Delete a transcript (cascades to all related data)
 */
export async function deleteTranscript(
  workspaceId: string,
  transcriptId: string
): Promise<void> {
  try {
    await prisma.transcript.delete({
      where: { workspaceId_id: { workspaceId, id: transcriptId }}
    });
  } catch (error) {
    console.error('Error deleting transcript:', error);
    throw new Error('Failed to delete transcript');
  }
}

/**
 * Toggle transcript release status
 */
export async function toggleTranscriptRelease(
  workspaceId: string,
  transcriptId: string,
  released: boolean
): Promise<TranscriptWithRelations> {
  try {
    const transcript = await prisma.transcript.update({
      where: { workspaceId_id: { workspaceId, id: transcriptId }},
      data: { released },
      include: transcriptWithRelationsInclude
    });
    return transcript;
  } catch (error) {
    console.error('Error toggling transcript release:', error);
    throw new Error('Failed to toggle transcript release');
  }
}

/**
 * Count transcripts in a workspace
 */
export async function countTranscripts(
  workspaceId: string,
  options: {
    released?: boolean;
  } = {}
): Promise<number> {
  try {
    const count = await prisma.transcript.count({
      where: {
        workspaceId,
        ...(options.released !== undefined && { released: options.released })
      }
    });
    return count;
  } catch (error) {
    console.error('Error counting transcripts:', error);
    throw new Error('Failed to count transcripts');
  }
}

/**
 * Get transcript statistics
 */
export async function getTranscriptStats(
  workspaceId: string,
  transcriptId: string
): Promise<{
  segmentCount: number;
  utteranceCount: number;
  duration: number;
}> {
  try {
    const [segmentCount, utteranceCount, durationData] = await Promise.all([
      prisma.speakerSegment.count({
        where: { transcriptId, workspaceId }
      }),
      prisma.utterance.count({
        where: { 
          speakerSegment: {
            transcriptId,
            workspaceId
          }
        }
      }),
      prisma.speakerSegment.aggregate({
        where: { transcriptId, workspaceId },
        _max: { endTimestamp: true }
      })
    ]);

    return {
      segmentCount,
      utteranceCount,
      duration: durationData._max.endTimestamp || 0,
    };
  } catch (error) {
    console.error('Error fetching transcript stats:', error);
    throw new Error('Failed to fetch transcript stats');
  }
}


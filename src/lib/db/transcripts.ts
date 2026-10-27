import 'server-only';

import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { publicAdministrativeBodyRelation } from "./types/administrativeBody";
import { NotFoundError } from "@/lib/api/errors";

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
    orderBy: { createdAt: 'desc' as const },
    // Not the request and response bodies: a transcribe response holds the whole transcript.
    select: { id: true, type: true, status: true, stage: true, percentComplete: true, failureReason: true, version: true, createdAt: true, updatedAt: true }
  },
  councilMeeting: {
    include: {
      city: true,
      administrativeBody: publicAdministrativeBodyRelation
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
  taskStatuses: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      status: true,
      type: true,
      stage: true,
      percentComplete: true,
      createdAt: true,
      updatedAt: true
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
 * The writes here bypass the meeting lifecycle (release, deletion), so they
 * never touch the transcript of a council meeting.
 */
const notAMeeting = { councilMeeting: { is: null } } satisfies Prisma.TranscriptWhereInput;

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
      where: { workspaceId_id: { workspaceId, id: transcriptId }, ...notAMeeting },
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
  await prisma.$transaction(async (tx) => {
    const transcript = await tx.transcript.findFirst({
      where: { workspaceId, id: transcriptId, ...notAMeeting },
      select: { speakerSegments: { select: { speakerTagId: true } } },
    });
    if (!transcript) {
      throw new NotFoundError('Transcript not found');
    }

    await tx.transcript.delete({
      where: { workspaceId_id: { workspaceId, id: transcriptId } }
    });

    // The segments go with the transcript, but their speaker tags have no link
    // to it. A tag that no other segment uses would stay behind as an orphan.
    const speakerTagIds = [...new Set(transcript.speakerSegments.map(s => s.speakerTagId))];
    await tx.speakerTag.deleteMany({
      where: { id: { in: speakerTagIds }, speakerSegments: { none: {} } }
    });
  });
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
      where: { workspaceId_id: { workspaceId, id: transcriptId }, ...notAMeeting },
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
        where: { meetingId: transcriptId, cityId: workspaceId }
      }),
      prisma.utterance.count({
        where: { 
          speakerSegment: {
            meetingId: transcriptId,
            cityId: workspaceId
          }
        }
      }),
      prisma.speakerSegment.aggregate({
        where: { meetingId: transcriptId, cityId: workspaceId },
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


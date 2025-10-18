"use server";

import { Prisma } from "@prisma/client";
import prisma from "./prisma";

// Define include objects with satisfies for type safety
const speakerWithRelationsInclude = {
  workspace: true,
  speakerTags: {
    include: {
      speakerSegments: {
        include: {
          transcript: {
            select: {
              id: true,
              name: true,
              workspaceId: true
            }
          }
        }
      }
    }
  },
  voicePrints: {
    orderBy: { createdAt: 'desc' as const },
    take: 1
  },
  person: {
    include: {
      city: true,
      roles: {
        include: {
          party: true,
          administrativeBody: true
        }
      }
    }
  }
} satisfies Prisma.SpeakerInclude;

const speakerMinimalInclude = {
  workspace: {
    select: {
      id: true,
      name: true
    }
  },
  person: {
    select: {
      id: true,
      name: true,
      name_en: true
    }
  },
  voicePrints: {
    orderBy: { createdAt: 'desc' as const },
    take: 1
  },
  _count: {
    select: {
      speakerTags: true,
      voicePrints: true
    }
  }
} satisfies Prisma.SpeakerInclude;

// Derive types from includes
export type SpeakerWithRelations = Prisma.SpeakerGetPayload<{ 
  include: typeof speakerWithRelationsInclude 
}>;

export type SpeakerMinimal = Prisma.SpeakerGetPayload<{ 
  include: typeof speakerMinimalInclude 
}>;

/**
 * Get a speaker by ID with all relations
 */
export async function getSpeaker(
  speakerId: string
): Promise<SpeakerWithRelations | null> {
  try {
    const speaker = await prisma.speaker.findUnique({
      where: { id: speakerId },
      include: speakerWithRelationsInclude
    });
    return speaker;
  } catch (error) {
    console.error('Error fetching speaker:', error);
    throw new Error('Failed to fetch speaker');
  }
}

/**
 * Get a minimal speaker (just counts and basic info)
 */
export async function getSpeakerMinimal(
  speakerId: string
): Promise<SpeakerMinimal | null> {
  try {
    const speaker = await prisma.speaker.findUnique({
      where: { id: speakerId },
      include: speakerMinimalInclude
    });
    return speaker;
  } catch (error) {
    console.error('Error fetching speaker:', error);
    throw new Error('Failed to fetch speaker');
  }
}

/**
 * List speakers in a workspace
 */
export async function listSpeakers(
  workspaceId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<SpeakerMinimal[]> {
  try {
    const speakers = await prisma.speaker.findMany({
      where: { workspaceId },
      include: speakerMinimalInclude,
      orderBy: { name: 'asc' },
      take: options.limit,
      skip: options.offset
    });
    return speakers;
  } catch (error) {
    console.error('Error fetching speakers:', error);
    throw new Error('Failed to fetch speakers');
  }
}

/**
 * Create a new speaker
 */
export async function createSpeaker(data: {
  id?: string;
  workspaceId: string;
  name: string;
  image?: string;
}): Promise<SpeakerWithRelations> {
  try {
    const speaker = await prisma.speaker.create({
      data: {
        ...(data.id && { id: data.id }), // Only set ID if provided
        workspaceId: data.workspaceId,
        name: data.name,
        image: data.image,
      },
      include: speakerWithRelationsInclude
    });
    return speaker;
  } catch (error) {
    console.error('Error creating speaker:', error);
    throw new Error('Failed to create speaker');
  }
}

/**
 * Update a speaker
 */
export async function updateSpeaker(
  speakerId: string,
  data: {
    name?: string;
    image?: string;
  },
  tx?: Prisma.TransactionClient
): Promise<SpeakerWithRelations> {
  const client = tx || prisma;
  try {
    const speaker = await client.speaker.update({
      where: { id: speakerId },
      data,
      include: speakerWithRelationsInclude
    });
    return speaker;
  } catch (error) {
    console.error('Error updating speaker:', error);
    throw new Error('Failed to update speaker');
  }
}

/**
 * Delete a speaker (cascades to all related data)
 */
export async function deleteSpeaker(speakerId: string): Promise<void> {
  try {
    await prisma.speaker.delete({
      where: { id: speakerId }
    });
  } catch (error) {
    console.error('Error deleting speaker:', error);
    throw new Error('Failed to delete speaker');
  }
}

/**
 * Count speakers in a workspace
 */
export async function countSpeakers(workspaceId: string): Promise<number> {
  try {
    const count = await prisma.speaker.count({
      where: { workspaceId }
    });
    return count;
  } catch (error) {
    console.error('Error counting speakers:', error);
    throw new Error('Failed to count speakers');
  }
}

/**
 * Search speakers by name
 */
export async function searchSpeakers(
  workspaceId: string,
  searchTerm: string,
  options: {
    limit?: number;
  } = {}
): Promise<SpeakerMinimal[]> {
  try {
    const speakers = await prisma.speaker.findMany({
      where: {
        workspaceId,
        name: {
          contains: searchTerm,
          mode: 'insensitive'
        }
      },
      include: speakerMinimalInclude,
      orderBy: { name: 'asc' },
      take: options.limit || 20
    });
    return speakers;
  } catch (error) {
    console.error('Error searching speakers:', error);
    throw new Error('Failed to search speakers');
  }
}


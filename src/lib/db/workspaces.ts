"use server";

import { Prisma } from "@prisma/client";
import prisma from "./prisma";

// Define include objects with satisfies for type safety
const workspaceWithRelationsInclude = {
  administrators: {
    include: {
      user: true
    }
  },
  transcripts: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
  speakers: true,
  city: true
} satisfies Prisma.WorkspaceInclude;

const workspaceMinimalInclude = {
  city: true,
  _count: {
    select: {
      transcripts: true,
      administrators: true,
      speakers: true
    }
  }
} satisfies Prisma.WorkspaceInclude;

// Derive types from includes
export type WorkspaceWithRelations = Prisma.WorkspaceGetPayload<{ 
  include: typeof workspaceWithRelationsInclude 
}>;

export type WorkspaceMinimal = Prisma.WorkspaceGetPayload<{ 
  include: typeof workspaceMinimalInclude 
}>;

/**
 * Get a workspace by ID with all relations
 */
export async function getWorkspace(
  workspaceId: string
): Promise<WorkspaceWithRelations | null> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: workspaceWithRelationsInclude
    });
    return workspace;
  } catch (error) {
    console.error('Error fetching workspace:', error);
    throw new Error('Failed to fetch workspace');
  }
}

/**
 * Get a minimal workspace (just counts and city relation)
 */
export async function getWorkspaceMinimal(
  workspaceId: string
): Promise<WorkspaceMinimal | null> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: workspaceMinimalInclude
    });
    return workspace;
  } catch (error) {
    console.error('Error fetching workspace:', error);
    throw new Error('Failed to fetch workspace');
  }
}

/**
 * List workspaces for a specific user
 */
export async function listWorkspacesForUser(
  userId: string
): Promise<WorkspaceMinimal[]> {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        administrators: {
          some: {
            userId
          }
        }
      },
      include: workspaceMinimalInclude,
      orderBy: { name: 'asc' }
    });
    return workspaces;
  } catch (error) {
    console.error('Error fetching workspaces for user:', error);
    throw new Error('Failed to fetch workspaces for user');
  }
}

/**
 * List all workspaces (admin only - no auth check here, do it in caller)
 */
export async function listWorkspaces(): Promise<WorkspaceMinimal[]> {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: workspaceMinimalInclude,
      orderBy: { name: 'asc' }
    });
    return workspaces;
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    throw new Error('Failed to fetch workspaces');
  }
}

/**
 * Create a new workspace
 */
export async function createWorkspace(data: {
  id?: string;
  name: string;
}): Promise<WorkspaceWithRelations> {
  try {
    const workspace = await prisma.workspace.create({
      data: {
        ...(data.id && { id: data.id }), // Only set ID if provided
        name: data.name,
      },
      include: workspaceWithRelationsInclude
    });
    return workspace;
  } catch (error) {
    console.error('Error creating workspace:', error);
    throw new Error('Failed to create workspace');
  }
}

/**
 * Create a new workspace and assign a user as administrator
 */
export async function createWorkspaceWithAdmin(data: {
  name: string;
  userId: string;
}): Promise<WorkspaceWithRelations> {
  try {
    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        administrators: {
          create: {
            userId: data.userId
          }
        }
      },
      include: workspaceWithRelationsInclude
    });
    return workspace;
  } catch (error) {
    console.error('Error creating workspace with admin:', error);
    throw new Error('Failed to create workspace');
  }
}

/**
 * Update a workspace
 */
export async function updateWorkspace(
  workspaceId: string,
  data: {
    name?: string;
  }
): Promise<WorkspaceWithRelations> {
  try {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
      include: workspaceWithRelationsInclude
    });
    return workspace;
  } catch (error) {
    console.error('Error updating workspace:', error);
    throw new Error('Failed to update workspace');
  }
}

/**
 * Delete a workspace (cascades to all related data)
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  try {
    await prisma.workspace.delete({
      where: { id: workspaceId }
    });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    throw new Error('Failed to delete workspace');
  }
}

/**
 * Check if a workspace is a city
 */
export async function isWorkspaceCity(workspaceId: string): Promise<boolean> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { city: true }
    });
    return !!workspace?.city;
  } catch (error) {
    console.error('Error checking if workspace is city:', error);
    return false;
  }
}


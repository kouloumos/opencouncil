import 'server-only';

import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { isMachineAccountAddress } from "@/lib/auth/machineAccounts";

/**
 * A workspace that is not a city. A city's workspace shares the city's id,
 * its admins are the city's admins, and deleting it deletes the city, so the
 * /workspaces pages and routes act only on these.
 */
const genericWorkspaceWhere = { city: { is: null } } satisfies Prisma.WorkspaceWhereInput;

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
 * Get a workspace that is not a city, with all relations
 */
export async function getGenericWorkspace(
  workspaceId: string
): Promise<WorkspaceWithRelations | null> {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, ...genericWorkspaceWhere },
    include: workspaceWithRelationsInclude
  });
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
 * List the workspaces, other than cities, that a user administers
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
        },
        ...genericWorkspaceWhere
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
 * List all workspaces other than cities (admin only - no auth check here, do it in caller)
 */
export async function listWorkspaces(): Promise<WorkspaceMinimal[]> {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: genericWorkspaceWhere,
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
 * Throws NotFoundError unless the workspace exists and is not a city.
 */
export async function assertGenericWorkspace(workspaceId: string): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...genericWorkspaceWhere },
    select: { id: true },
  });
  if (!workspace) {
    throw new NotFoundError('Workspace not found');
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
      where: { id: workspaceId, ...genericWorkspaceWhere },
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
      where: { id: workspaceId, ...genericWorkspaceWhere }
    });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    throw new Error('Failed to delete workspace');
  }
}

const workspaceMemberInclude = {
  user: { select: { id: true, email: true, name: true } }
} satisfies Prisma.AdministersInclude;

export type WorkspaceMember = Prisma.AdministersGetPayload<{ include: typeof workspaceMemberInclude }>;

/**
 * The members of a workspace: its admins. Administers.cityId holds the
 * workspace id.
 */
export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return prisma.administers.findMany({
    where: { cityId: workspaceId },
    include: workspaceMemberInclude
  });
}

/**
 * Make the account with this email a member of the workspace, and create the
 * account if it does not exist. No auth check: the caller checks the workspace.
 */
export async function addWorkspaceMember(workspaceId: string, rawEmail: string, name?: string) {
  // As createUser does: the sign-in lookup uses the lowercase address, and the
  // machine account domain belongs to machine accounts only.
  const email = rawEmail.trim().toLowerCase();
  if (isMachineAccountAddress(email)) {
    throw new BadRequestError("This address is reserved for machine accounts");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email, name: name || email.split('@')[0] },
      select: { id: true, email: true, name: true }
    });
    const existing = await tx.administers.findFirst({ where: { userId: user.id, cityId: workspaceId } });
    if (existing) {
      throw new ConflictError('User is already a member of this workspace');
    }
    await tx.administers.create({ data: { userId: user.id, cityId: workspaceId } });
    return user;
  });
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  await prisma.administers.deleteMany({ where: { userId, cityId: workspaceId } });
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


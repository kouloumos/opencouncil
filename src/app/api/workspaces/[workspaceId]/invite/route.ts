import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { z } from 'zod';
import { findOrCreateUser, sendWorkspaceInviteEmail } from '@/lib/invitations';

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().optional()
});

/**
 * POST /api/workspaces/[workspaceId]/invite
 * Invite a user to a workspace
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const body = await request.json();
    const { email, name } = inviteSchema.parse(body);

    // Get workspace info for the invitation email
    const workspace = await prisma.workspace.findUnique({
      where: { id: params.workspaceId }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Find or create user
    const user = await findOrCreateUser(email, name);

    // Check if user is already an administrator
    const existingAdmin = await prisma.administers.findFirst({
      where: {
        userId: user.id,
        workspaceId: params.workspaceId
      }
    });

    if (existingAdmin) {
      return NextResponse.json(
        { error: 'User is already a member of this workspace' },
        { status: 409 }
      );
    }

    // Create administration relationship
    await prisma.administers.create({
      data: {
        userId: user.id,
        workspaceId: params.workspaceId
      }
    });

    // Send workspace invitation email with workspace ID for redirect
    try {
      await sendWorkspaceInviteEmail(email, user.name || email, workspace.name, params.workspaceId);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Don't fail the whole request if email fails
    }

    return NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Failed to invite user:', error);
    return NextResponse.json(
      { error: 'Failed to invite user' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspaces/[workspaceId]/invite
 * List workspace members
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const members = await prisma.administers.findMany({
      where: { workspaceId: params.workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/invite
 * Remove a user from workspace
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await prisma.administers.deleteMany({
      where: {
        userId,
        workspaceId: params.workspaceId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}


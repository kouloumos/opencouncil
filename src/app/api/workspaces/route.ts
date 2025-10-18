import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { listWorkspacesForUser, createWorkspace } from '@/lib/db/workspaces';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required")
});

/**
 * GET /api/workspaces
 * List all workspaces the current user has access to
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaces = await listWorkspacesForUser(user.id);
    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace (admin only for now)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, only superadmins can create workspaces
    if (!user.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only administrators can create workspaces' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name } = createWorkspaceSchema.parse(body);

    const workspace = await createWorkspace({ name });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Failed to create workspace:', error);
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 }
    );
  }
}


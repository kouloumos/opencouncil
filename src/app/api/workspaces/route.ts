import { NextRequest, NextResponse } from 'next/server';
import { listWorkspacesForUser, createWorkspaceWithAdmin } from '@/lib/db/workspaces';
import { getCurrentUser } from '@/lib/auth';
import * as z from 'zod';
import { sendWorkspaceCreatedAdminAlert } from '@/lib/discord';
import { handleApiError, notAuthorizedErrorResponse } from '@/lib/api/errors';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required")
});

/**
 * GET /api/workspaces
 * List all workspaces the current user has access to
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return notAuthorizedErrorResponse(false);
    }

    const workspaces = await listWorkspacesForUser(user.id);
    return NextResponse.json(workspaces);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch workspaces');
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace - authenticated users can create personal workspaces
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return notAuthorizedErrorResponse(false);
    }

    const { name } = createWorkspaceSchema.parse(await request.json());

    // Create workspace and assign creator as admin
    const workspace = await createWorkspaceWithAdmin({
      name,
      userId: user.id
    });

    // Send admin notification (non-blocking)
    sendWorkspaceCreatedAdminAlert({
      workspaceName: workspace.name,
      workspaceId: workspace.id
    }).catch(error => {
      console.error('Failed to send workspace created admin alert:', error);
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create workspace');
  }
}

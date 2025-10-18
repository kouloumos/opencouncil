import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getWorkspace, updateWorkspace, deleteWorkspace } from '@/lib/db/workspaces';
import { z } from 'zod';

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional()
});

/**
 * GET /api/workspaces/[workspaceId]
 * Get workspace details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const workspace = await getWorkspace(params.workspaceId);
    
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Failed to fetch workspace:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspaces/[workspaceId]
 * Update workspace
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    const body = await request.json();
    const data = updateWorkspaceSchema.parse(body);

    const workspace = await updateWorkspace(params.workspaceId, data);

    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('Failed to update workspace:', error);
    return NextResponse.json(
      { error: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]
 * Delete workspace (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    await withUserAuthorizedToEdit({ workspaceId: params.workspaceId });
    
    await deleteWorkspace(params.workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
}


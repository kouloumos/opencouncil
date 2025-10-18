import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { assertGenericWorkspace, getWorkspace, updateWorkspace, deleteWorkspace } from '@/lib/db/workspaces';
import * as z from 'zod';
import { handleApiError } from '@/lib/api/errors';

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional()
});

type Params = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]
 * Get workspace details
 */
export async function GET(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const workspace = await getWorkspace(workspaceId);
    return NextResponse.json(workspace);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch workspace');
  }
}

/**
 * PUT /api/workspaces/[workspaceId]
 * Update workspace
 */
export async function PUT(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const data = updateWorkspaceSchema.parse(await request.json());
    const workspace = await updateWorkspace(workspaceId, data);

    return NextResponse.json(workspace);
  } catch (error) {
    return handleApiError(error, 'Failed to update workspace');
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]
 * Delete workspace (admin only)
 */
export async function DELETE(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    await deleteWorkspace(workspaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete workspace');
  }
}

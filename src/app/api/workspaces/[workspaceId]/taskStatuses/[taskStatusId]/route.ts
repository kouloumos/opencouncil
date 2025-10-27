import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { deleteTaskStatusDirect, getWorkspaceTaskScope } from '@/lib/db/tasksInternal';
import { ConflictError, handleApiError, NotFoundError } from '@/lib/api/errors';

type Params = { params: Promise<{ workspaceId: string; taskStatusId: string }> };

/**
 * DELETE /api/workspaces/[workspaceId]/taskStatuses/[taskStatusId]
 * Delete a task of the workspace (super admin only)
 */
export async function DELETE(request: NextRequest, props: Params) {
  const { workspaceId, taskStatusId } = await props.params;
  try {
    await withUserAuthorizedToEdit({});

    const taskStatus = await getWorkspaceTaskScope(taskStatusId, workspaceId);
    if (!taskStatus) {
      throw new NotFoundError('Task status not found');
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const removed = await deleteTaskStatusDirect(taskStatusId, taskStatus, tenMinutesAgo);
    if (removed === 0) {
      throw new ConflictError('Cannot delete task that has been updated within the last 10 minutes');
    }

    return NextResponse.json({ message: 'Task status deleted successfully' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete task status');
  }
}

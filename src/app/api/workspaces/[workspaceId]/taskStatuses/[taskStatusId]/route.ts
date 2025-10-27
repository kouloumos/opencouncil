import { NextRequest, NextResponse } from 'next/server';
import { deleteTaskStatus, getTaskStatus } from '@/lib/db/tasks';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string; taskStatusId: string } }
) {
  const user = await getCurrentUser();
  
  if (!user || !user.isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized. Only super admins can delete tasks.' }, { status: 403 });
  }

  const taskStatus = await getTaskStatus(params.taskStatusId);

  if (!taskStatus) {
    return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
  }

  // Check that this task belongs to the specified workspace
  if (taskStatus.workspaceId !== params.workspaceId) {
    return NextResponse.json({ error: 'Task status does not belong to this workspace' }, { status: 400 });
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (taskStatus.updatedAt > tenMinutesAgo) {
    return NextResponse.json({ error: 'Cannot delete task that has been updated within the last 10 minutes' }, { status: 403 });
  }

  await deleteTaskStatus(params.taskStatusId);

  return NextResponse.json({ message: 'Task status deleted successfully' });
}

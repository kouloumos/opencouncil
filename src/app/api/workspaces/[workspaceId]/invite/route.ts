import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import * as z from 'zod';
import { sendWorkspaceInviteEmail } from '@/lib/invitations';
import {
  addWorkspaceMember,
  assertGenericWorkspace,
  getWorkspaceMinimal,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from '@/lib/db/workspaces';
import { BadRequestError, handleApiError } from '@/lib/api/errors';

const inviteSchema = z.object({
  email: z.email("Valid email required"),
  name: z.string().optional()
});

type Params = { params: Promise<{ workspaceId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/invite
 * Invite a user to a workspace
 */
export async function POST(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const { email, name } = inviteSchema.parse(await request.json());

    const user = await addWorkspaceMember(workspaceId, email, name);
    const workspace = await getWorkspaceMinimal(workspaceId);

    try {
      await sendWorkspaceInviteEmail(user.email, user.name || user.email, workspace?.name ?? '', workspaceId, request);
    } catch (emailError) {
      // The membership stands without the email.
      console.error('Failed to send invitation email:', emailError);
    }

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to invite user');
  }
}

/**
 * GET /api/workspaces/[workspaceId]/invite
 * List workspace members
 */
export async function GET(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    return NextResponse.json(await listWorkspaceMembers(workspaceId));
  } catch (error) {
    return handleApiError(error, 'Failed to fetch members');
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/invite
 * Remove a user from workspace
 */
export async function DELETE(request: NextRequest, props: Params) {
  const { workspaceId } = await props.params;
  try {
    await withUserAuthorizedToEdit({ workspaceId });
    await assertGenericWorkspace(workspaceId);

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      throw new BadRequestError('userId is required');
    }

    await removeWorkspaceMember(workspaceId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to remove member');
  }
}

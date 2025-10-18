import "server-only";
import { render } from "@react-email/render";
import prisma from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { generateSignInLink } from "@/lib/auth/invite";
import { WorkspaceInviteEmail } from "@/lib/email/templates/workspace-invite";

/**
 * Sends a workspace invitation email to a user. `request` repoints the sign-in
 * link at the host the inviter uses (see generateSignInLink).
 */
export async function sendWorkspaceInviteEmail(
  email: string,
  name: string,
  workspaceName: string,
  request?: Request
): Promise<void> {
  const { signInUrl } = await generateSignInLink(email, request);
  const emailHtml = await render(WorkspaceInviteEmail({
    name: name || email,
    workspaceName,
    inviteUrl: signInUrl
  }));

  const result = await sendEmail({
    from: "auth",
    to: email,
    subject: `Invitation to join ${workspaceName} workspace`,
    html: emailHtml,
  });
  if (!result.success) {
    throw new Error("Failed to send the workspace invitation email");
  }
}

/**
 * Finds or creates a user by email
 */
export async function findOrCreateUser(email: string, name?: string) {
  return await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: name || email.split('@')[0] // Simple default name
    }
  });
}

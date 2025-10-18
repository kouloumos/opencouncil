import { createHash } from "crypto";
import { env } from "@/env.mjs";
import prisma from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { renderAsync } from "@react-email/render";
import { UserInviteEmail } from "@/lib/email/templates/user-invite";
import { WorkspaceInviteEmail } from "@/lib/email/templates/workspace-invite";

/**
 * Generates a sign-in link for a user invitation
 */
export async function generateSignInLink(email: string, callbackUrl?: string): Promise<string> {
  // Create a token that expires in 24 hours
  const token = createHash('sha256')
    .update(email + Date.now().toString())
    .digest('hex');

  // Save the token in the database
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
  });

  // Generate the sign-in URL with optional callback
  let signInUrl = `${env.NEXT_PUBLIC_BASE_URL}/sign-in?token=${token}&email=${encodeURIComponent(email)}`;
  if (callbackUrl) {
    signInUrl += `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }
  return signInUrl;
}

/**
 * Sends an admin invitation email to a user (for OpenCouncil platform access)
 */
export async function sendInviteEmail(
  email: string, 
  name: string
): Promise<void> {
  const signInUrl = await generateSignInLink(email);
  const emailHtml = await renderAsync(UserInviteEmail({
    name: name || email,
    inviteUrl: signInUrl
  }));

  await sendEmail({
    from: "OpenCouncil <auth@opencouncil.gr>",
    to: email,
    subject: "You've been invited to OpenCouncil",
    html: emailHtml,
  });
}

/**
 * Sends a workspace invitation email to a user
 */
export async function sendWorkspaceInviteEmail(
  email: string,
  name: string,
  workspaceName: string,
  workspaceId?: string
): Promise<void> {
  // Generate callback URL to redirect to the workspace after sign-in
  const callbackUrl = workspaceId ? `/workspaces/${workspaceId}` : '/workspaces';
  const signInUrl = await generateSignInLink(email, callbackUrl);
  
  const emailHtml = await renderAsync(WorkspaceInviteEmail({
    name: name || email,
    workspaceName,
    inviteUrl: signInUrl
  }));

  await sendEmail({
    from: "OpenTranscripts <auth@opencouncil.gr>",
    to: email,
    subject: `Πρόσκληση στο χώρο εργασίας ${workspaceName}`,
    html: emailHtml,
  });
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


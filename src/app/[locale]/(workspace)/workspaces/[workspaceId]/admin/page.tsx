import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import { WorkspaceAdminPanel } from '@/components/workspaces/WorkspaceAdminPanel';
import { setRequestLocale } from 'next-intl/server';
import { WorkspaceSettingsShell } from '@/components/workspaces/WorkspaceSettingsShell';

export default async function WorkspaceAdminPage(props: {
  params: Promise<{ workspaceId: string; locale: string }>
}) {
  const params = await props.params;
  setRequestLocale(params.locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  if (!user.isSuperAdmin) {
    redirect(`/workspaces/${params.workspaceId}`);
  }

  const workspace = await getGenericWorkspace(params.workspaceId);
  if (!workspace) {
    notFound();
  }

  return (
    <WorkspaceSettingsShell workspaceId={params.workspaceId} workspaceName={workspace.name} active="members">
      <WorkspaceAdminPanel workspaceId={params.workspaceId} />
    </WorkspaceSettingsShell>
  );
}


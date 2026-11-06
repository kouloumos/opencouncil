import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import WorkspaceTasksAdmin from '@/components/workspaces/WorkspaceTasksAdmin';
import { setRequestLocale } from 'next-intl/server';
import { WorkspaceSettingsShell } from '@/components/workspaces/WorkspaceSettingsShell';
import { SettingsCard, SettingsBody } from '@/components/profile/SettingsChrome';

export default async function WorkspaceTasksAdminPage(props: {
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
    <WorkspaceSettingsShell workspaceId={params.workspaceId} workspaceName={workspace.name} active="tasks">
      <SettingsCard>
        <SettingsBody>
          <WorkspaceTasksAdmin workspaceId={params.workspaceId} />
        </SettingsBody>
      </SettingsCard>
    </WorkspaceSettingsShell>
  );
}


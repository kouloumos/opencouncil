import { redirect, notFound } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getWorkspace } from '@/lib/db/workspaces';
import { WorkspaceAdminPanel } from '@/components/workspaces/WorkspaceAdminPanel';
import { getTranslations } from 'next-intl/server';

export default async function WorkspaceAdminPage({
  params
}: {
  params: { workspaceId: string }
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/api/auth/signin');
  }

  const workspace = await getWorkspace(params.workspaceId);
  
  if (!workspace) {
    notFound();
  }

  const canEdit = await isUserAuthorizedToEdit({ workspaceId: params.workspaceId });
  
  if (!canEdit) {
    redirect(`/workspaces/${params.workspaceId}`);
  }

  const t = await getTranslations('workspaces.members');

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{workspace.name}</p>
      </div>

      <WorkspaceAdminPanel workspaceId={params.workspaceId} />
    </div>
  );
}


import { redirect, notFound } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getWorkspace } from '@/lib/db/workspaces';
import WorkspaceTasksAdmin from '@/components/workspaces/WorkspaceTasksAdmin';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function WorkspaceTasksAdminPage({
  params
}: {
  params: { workspaceId: string; locale: string }
}) {
  setRequestLocale(params.locale);
  
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/api/auth/signin');
  }

  if (!user.isSuperAdmin) {
    redirect(`/workspaces/${params.workspaceId}`);
  }

  const workspace = await getWorkspace(params.workspaceId);
  
  if (!workspace) {
    notFound();
  }

  const t = await getTranslations('workspaces.tasks');

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">{workspace.name}</p>
      </div>

      <WorkspaceTasksAdmin workspaceId={params.workspaceId} />
    </div>
  );
}


import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaces } from '@/lib/db/workspaces';
import { WorkspaceManagement } from '@/components/admin/WorkspaceManagement';
import { getTranslations } from 'next-intl/server';

export default async function AdminWorkspacesPage() {
  const user = await getCurrentUser();
  
  if (!user?.isSuperAdmin) {
    redirect('/');
  }

  const workspaces = await listWorkspaces();
  const t = await getTranslations('workspaces.admin');

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('noWorkspacesDescription')}
        </p>
      </div>

      <WorkspaceManagement workspaces={workspaces} />
    </div>
  );
}


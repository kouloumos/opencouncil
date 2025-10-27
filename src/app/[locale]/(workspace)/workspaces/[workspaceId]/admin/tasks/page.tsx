import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import WorkspaceTasksAdmin from '@/components/workspaces/WorkspaceTasksAdmin';
import { getTranslations, setRequestLocale } from 'next-intl/server';

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


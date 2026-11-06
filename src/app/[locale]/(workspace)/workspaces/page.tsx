import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspacesForUser } from '@/lib/db/workspaces';
import { WorkspaceList } from '@/components/workspaces/WorkspaceList';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreateWorkspaceCard } from '@/components/workspaces/CreateWorkspaceCard';

export default async function WorkspacesPage(props: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const workspaces = await listWorkspacesForUser(user.id);
  const t = await getTranslations('workspaces.list');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 pb-16 pt-8 sm:px-6 lg:pt-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {workspaces.length > 0 ? t('workspacesDescription') : t('noWorkspaces')}
        </p>
      </div>

      {/* A user creates a workspace only while they have none. */}
      {workspaces.length === 0 ? <CreateWorkspaceCard /> : <WorkspaceList workspaces={workspaces} />}
    </div>
  );
}

import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import { listTranscripts } from '@/lib/db/transcripts';
import { TranscriptList } from '@/components/workspaces/TranscriptList';
import { UploadTranscriptForm } from '@/components/workspaces/UploadTranscriptForm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Settings } from 'lucide-react';
import { secondaryPillClass } from '@/components/workspaces/styles';

export default async function WorkspacePage(props: {
  params: Promise<{ workspaceId: string; locale: string }>
}) {
  const params = await props.params;
  setRequestLocale(params.locale);

  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  // A workspace is private to its members, who are its admins.
  const canEdit = await isUserAuthorizedToEdit({ workspaceId: params.workspaceId });
  const workspace = canEdit ? await getGenericWorkspace(params.workspaceId) : null;
  if (!workspace) {
    notFound();
  }
  const isSuperAdmin = user.isSuperAdmin || false;
  const transcripts = await listTranscripts(params.workspaceId);
  const t = await getTranslations('workspaces.list');
  const tDashboard = await getTranslations('workspaces.dashboard');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
      <nav aria-label={t('title')} className="text-[13px] text-muted-foreground">
        <Link href="/workspaces" className="text-muted-foreground hover:text-foreground hover:no-underline">{t('title')}</Link>
        <span aria-hidden className="mx-2">/</span>
        <span className="text-foreground">{workspace.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t('transcriptsCount', { count: transcripts.length })}
            {' · '}
            {t('membersCount', { count: workspace.administrators.length })}
          </p>
        </div>
        {isSuperAdmin && (
          <Button asChild className={secondaryPillClass}>
            <Link href={`/workspaces/${params.workspaceId}/admin`} className="hover:no-underline">
              <Settings className="mr-2 h-4 w-4" aria-hidden />
              {tDashboard('settings')}
            </Link>
          </Button>
        )}
      </div>

      {canEdit && <UploadTranscriptForm workspaceId={params.workspaceId} />}

      <TranscriptList
        transcripts={transcripts} 
        workspaceId={params.workspaceId}
        canEdit={canEdit}
        canDelete={canEdit}
        locale={params.locale}
      />
    </div>
  );
}


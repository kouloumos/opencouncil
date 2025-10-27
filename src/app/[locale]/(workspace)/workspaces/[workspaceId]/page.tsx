import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getGenericWorkspace } from '@/lib/db/workspaces';
import { listTranscripts } from '@/lib/db/transcripts';
import { TranscriptList } from '@/components/workspaces/TranscriptList';
import { UploadTranscriptForm } from '@/components/workspaces/UploadTranscriptForm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { Settings, List } from 'lucide-react';

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

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">{workspace.name}</h1>
          {isSuperAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/workspaces/${params.workspaceId}/admin/tasks`}>
                  <List className="h-4 w-4 mr-2" />
                  Tasks
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/workspaces/${params.workspaceId}/admin`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Admin
                </Link>
              </Button>
            </div>
          )}
        </div>
        <p className="text-muted-foreground">
          {t('transcriptsCount', { count: transcripts.length })}
        </p>
      </div>

      {canEdit && (
        <div className="mb-8">
          <UploadTranscriptForm workspaceId={params.workspaceId} />
        </div>
      )}

      <TranscriptList 
        transcripts={transcripts} 
        workspaceId={params.workspaceId}
        canEdit={canEdit}
        canDelete={isSuperAdmin}
        locale={params.locale}
      />
    </div>
  );
}


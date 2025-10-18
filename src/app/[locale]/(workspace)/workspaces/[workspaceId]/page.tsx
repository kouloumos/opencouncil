import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import { getWorkspace } from '@/lib/db/workspaces';
import { listTranscripts } from '@/lib/db/transcripts';
import { TranscriptList } from '@/components/workspaces/TranscriptList';
import { UploadTranscriptForm } from '@/components/workspaces/UploadTranscriptForm';
import { getTranslations } from 'next-intl/server';

export default async function WorkspacePage({
  params
}: {
  params: { workspaceId: string; locale: string }
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
  const transcripts = await listTranscripts(params.workspaceId);
  const t = await getTranslations('workspaces.list');

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{workspace.name}</h1>
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
        locale={params.locale}
      />
    </div>
  );
}


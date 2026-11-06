'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fieldClass, primaryPillClass } from './styles';

interface UploadTranscriptFormProps {
  workspaceId: string;
}

export function UploadTranscriptForm({ workspaceId }: UploadTranscriptFormProps) {
  const [name, setName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('workspaces.upload');
  const tCommon = useTranslations('workspaces.common');

  async function handleCreate() {
    if (!name.trim()) {
      toast({
        title: t('errors.nameRequired'),
        description: t('errors.nameRequired'),
        variant: 'destructive'
      });
      return;
    }

    if (!videoUrl.trim()) {
      toast({
        title: t('errors.fileOrLinkRequired'),
        description: t('errors.fileOrLinkRequired'),
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);

    try {
      // 1. Create transcript
      const transcriptResponse = await fetch(`/api/workspaces/${workspaceId}/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, videoUrl })
      });

      if (!transcriptResponse.ok) {
        throw new Error('Failed to create transcript');
      }

      const transcript = await transcriptResponse.json();

      // 2. Request transcription
      const transcribeResponse = await fetch(
        `/api/workspaces/${workspaceId}/transcripts/${transcript.id}/transcribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeUrl: videoUrl })
        }
      );

      if (!transcribeResponse.ok) {
        throw new Error('Failed to start transcription');
      }

      toast({
        title: t('success.title'),
        description: t('success.description')
      });

      // Navigate to the transcript page
      router.push(`/workspaces/${workspaceId}/transcripts/${transcript.id}`);
    } catch (error) {
      console.error('Failed to create transcript:', error);
      toast({
        title: tCommon('error'),
        description: t('errors.uploadFailed'),
        variant: 'destructive'
      });
      setIsCreating(false);
    }
  }

  return (
    <section
      aria-labelledby="upload-title"
      className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-dashed border-stone-300 bg-muted/35 p-4 sm:p-5"
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange)/0.1)] text-[hsl(var(--orange-deep))]" aria-hidden>
          <Upload className="h-5 w-5" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span id="upload-title" className="text-[15px] font-semibold">{t('title')}</span>
          <span className="text-[13px] text-muted-foreground">{t('dropFiles')}</span>
        </span>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label htmlFor="name" className="text-[13px] font-medium">{t('transcriptName')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('transcriptNamePlaceholder')}
            disabled={isCreating}
            className={fieldClass}
          />
        </div>

        <div className="flex min-w-[280px] flex-[2] flex-col gap-1.5">
          <Label htmlFor="video" className="text-[13px] font-medium">{t('videoLabel')}</Label>
          <LinkOrDrop
            id="video"
            value={videoUrl}
            onUrlChange={setVideoUrl}
            placeholder={t('linkPlaceholder')}
            disabled={isCreating}
            inputClassName={fieldClass}
            // A workspace admin passes the city check of the upload: the
            // admin row of a workspace names it in cityId.
            config={{ cityId: workspaceId, kind: 'recording' }}
          />
        </div>

        <Button
          type="submit"
          disabled={isCreating || !name.trim() || !videoUrl.trim()}
          className={primaryPillClass}
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              {t('uploading')}
            </>
          ) : (
            t('uploadButton')
          )}
        </Button>
      </form>
    </section>
  );
}


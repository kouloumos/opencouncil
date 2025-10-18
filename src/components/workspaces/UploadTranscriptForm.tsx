'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>
          {t('dropFiles')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('transcriptName')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('transcriptNamePlaceholder')}
            disabled={isCreating}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="video">{t('videoLabel')}</Label>
          <LinkOrDrop
            id="video"
            value={videoUrl}
            onUrlChange={setVideoUrl}
            placeholder={t('linkPlaceholder')}
            disabled={isCreating}
          />
        </div>

        <Button 
          onClick={handleCreate} 
          disabled={isCreating || !name.trim() || !videoUrl.trim()}
          className="w-full"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('uploading')}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {t('uploadButton')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}


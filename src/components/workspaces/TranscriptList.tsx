'use client';

import { Link } from '@/i18n/routing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TranscriptMinimal } from '@/lib/db/transcripts';
import { FileText, Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { el } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface TranscriptListProps {
  transcripts: TranscriptMinimal[];
  workspaceId: string;
  canEdit: boolean;
  canDelete?: boolean;
  locale?: string;
}

export function TranscriptList({ transcripts, workspaceId, canEdit, canDelete = false, locale = 'el' }: TranscriptListProps) {
  const t = useTranslations('workspaces.dashboard');
  const tCommon = useTranslations('workspaces.common');
  const router = useRouter();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(transcript: TranscriptMinimal, e: React.MouseEvent) {
    e.preventDefault(); // Prevent navigation to transcript page
    e.stopPropagation();

    if (!confirm(t('confirmDelete', { name: transcript.name }))) {
      return;
    }

    setDeletingId(transcript.id);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/transcripts/${transcript.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete transcript');
      }

      toast({
        title: tCommon('success'),
        description: t('deleteSuccess')
      });

      router.refresh();
    } catch (error) {
      console.error('Failed to delete transcript:', error);
      toast({
        title: tCommon('error'),
        description: t('deleteError'),
        variant: 'destructive'
      });
    } finally {
      setDeletingId(null);
    }
  }
  
  if (transcripts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {t('noTranscriptsDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {transcripts.map((transcript) => (
        <div key={transcript.id} className="relative">
          <Link href={`/workspaces/${workspaceId}/transcripts/${transcript.id}`}>
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileText className="w-5 h-5 flex-shrink-0" />
                      <span className="truncate">{transcript.name}</span>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDistanceToNow(new Date(transcript.createdAt), { 
                          addSuffix: true,
                          locale: locale === 'el' ? el : undefined 
                        })}
                      </span>
                      {transcript._count && (
                        <>
                          <span>{transcript._count.speakerSegments} segments</span>
                          <span>{transcript._count.taskStatuses} tasks</span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {transcript.released && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Published
                      </span>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDelete(transcript, e)}
                        disabled={deletingId === transcript.id}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      ))}
    </div>
  );
}


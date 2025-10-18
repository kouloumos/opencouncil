'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TranscriptMinimal } from '@/lib/db/transcripts';
import { FileText, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { el } from 'date-fns/locale';

interface TranscriptListProps {
  transcripts: TranscriptMinimal[];
  workspaceId: string;
  canEdit: boolean;
  locale?: string;
}

export function TranscriptList({ transcripts, workspaceId, canEdit, locale = 'el' }: TranscriptListProps) {
  const t = useTranslations('workspaces.dashboard');
  
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
        <Link 
          key={transcript.id} 
          href={`/workspaces/${workspaceId}/transcripts/${transcript.id}`}
        >
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <FileText className="w-5 h-5" />
                    {transcript.name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-4 mt-2">
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
                {transcript.released && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Published
                  </span>
                )}
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}


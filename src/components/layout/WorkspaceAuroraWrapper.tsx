"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const Aurora = dynamic(() => import('@/components/landing/aurora'), { ssr: false });

export function WorkspaceAuroraWrapper() {
  const pathname = usePathname();
  // Check if we are in the transcripts editing page
  // The path pattern is /workspaces/[workspaceId]/transcripts/[transcriptId]
  const isTranscriptPage = pathname?.includes('/transcripts/');

  if (isTranscriptPage) {
    return null;
  }

  return (
    <div className="absolute top-0 left-0 w-full h-screen z-0" style={{ pointerEvents: 'auto' }}>
      <Aurora className="w-full h-full" />
    </div>
  );
}


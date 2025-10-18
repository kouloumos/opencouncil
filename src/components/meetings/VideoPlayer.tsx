import React, { forwardRef } from 'react';
import MuxVideo from '@mux/mux-video-react';
import { cn, IS_DEV } from '@/lib/utils';

interface VideoPlayerProps {
    id: string;
    title: string;
    playbackId: string;
    videoUrl?: string;
    className?: string;
    containerClassName?: string;
    onSeeked?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onSeeking?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onTimeUpdate?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
    onClick?: (e: React.MouseEvent) => void;
}

/**
 * Unified video player component that supports both local HTML5 video (for development)
 * and MUX video (for production). Automatically switches between them based on environment
 * and video URL.
 */
export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
    (
        {
            id,
            title,
            playbackId,
            videoUrl,
            className,
            containerClassName,
            onSeeked,
            onSeeking,
            onTimeUpdate,
            onClick,
        },
        ref
    ) => {
        // Use local video if in development and videoUrl is from localhost
        const shouldUseLocalVideo = IS_DEV && videoUrl?.includes('localhost');

        const containerClasses = cn(
            'relative w-full bg-black',
            containerClassName
        );

        const videoClasses = cn('w-full h-full object-contain', className);

        const videoStyle = {
            width: '100%',
            height: '100%',
        };

        if (shouldUseLocalVideo && videoUrl) {
            return (
                <div className={containerClasses} onClick={onClick}>
                    <video
                        ref={ref}
                        src={videoUrl}
                        controls
                        playsInline
                        disablePictureInPicture
                        className={videoClasses}
                        style={videoStyle}
                        onSeeked={onSeeked}
                        onSeeking={onSeeking}
                        onTimeUpdate={onTimeUpdate}
                        onError={(e) => {
                            console.warn(`Failed to load local video: ${videoUrl}`, e);
                        }}
                    />
                </div>
            );
        }

        // Use MUX video for production or non-localhost URLs
        return (
            <div className={containerClasses} onClick={onClick}>
                <MuxVideo
                    ref={ref as any}
                    streamType="on-demand"
                    playbackId={playbackId}
                    metadata={{
                        video_id: id,
                        video_title: title,
                    }}
                    playsInline
                    disablePictureInPicture
                    className={videoClasses}
                    style={videoStyle}
                    controls
                    onSeeked={onSeeked}
                    onSeeking={onSeeking}
                    onTimeUpdate={onTimeUpdate}
                />
            </div>
        );
    }
);

VideoPlayer.displayName = 'VideoPlayer';


"use server";
import { CouncilMeeting, Subject, AdministrativeBody, Topic, Prisma } from '@prisma/client';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, isUserAuthorizedToEdit } from '../auth';
import { 
  getTranscript, 
  toggleTranscriptRelease as toggleTranscriptReleaseGeneric 
} from './transcripts';

export type CouncilMeetingWithAdminBody = CouncilMeeting & {
    administrativeBody: AdministrativeBody | null;
    transcript?: {
        audioUrl: string | null;
        videoUrl: string | null;
        muxPlaybackId: string | null;
        released: boolean;
    } | null;
}

export type CouncilMeetingWithAdminBodyAndSubjects = CouncilMeetingWithAdminBody & {
    subjects: (Subject & {
        topic: Topic | null;
        speakerSegments: any[];
    })[]
}

export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        await prisma.councilMeeting.delete({
            where: { cityId_id: { cityId, id } },
        });
    } catch (error) {
        console.error('Error deleting council meeting:', error);
        throw new Error('Failed to delete council meeting');
    }
}

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl' | 'released' | 'muxPlaybackId'> & { audioUrl?: string, videoUrl?: string, released?: boolean, muxPlaybackId?: string | null }): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    try {
        // Extract transcript fields (audioUrl, videoUrl, muxPlaybackId, released moved to Transcript)
        const { audioUrl, videoUrl, released, muxPlaybackId, ...councilMeetingData } = meetingData;
        
        // Create in transaction: Transcript first, then CouncilMeeting
        const newMeeting = await prisma.$transaction(async (tx) => {
            // Create Transcript
            await tx.transcript.create({
                data: {
                    id: meetingData.id,
                    workspaceId: meetingData.cityId,
                    name: meetingData.name,
                    videoUrl,
                    audioUrl,
                    muxPlaybackId: muxPlaybackId ?? null,
                    released: released ?? false, // Default to false if not provided
                }
            });
            
            // Create CouncilMeeting
            return await tx.councilMeeting.create({
                data: councilMeetingData,
                include: {
                    administrativeBody: true,
                    transcript: true
                }
            });
        });
        
        // Flatten transcript data for backward compatibility
        return {
            ...newMeeting,
            administrativeBody: newMeeting.administrativeBody,
            transcript: newMeeting.transcript ? {
                audioUrl: newMeeting.transcript.audioUrl,
                videoUrl: newMeeting.transcript.videoUrl,
                muxPlaybackId: newMeeting.transcript.muxPlaybackId,
                released: newMeeting.transcript.released
            } : null
        };
    } catch (error) {
        console.error('Error creating council meeting:', error);
        throw new Error('Failed to create council meeting');
    }
}

export async function editCouncilMeeting(cityId: string, id: string, meetingData: Partial<Omit<CouncilMeeting, 'id' | 'cityId' | 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl' | 'muxPlaybackId'> & { audioUrl?: string; videoUrl?: string; muxPlaybackId?: string }>): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        // ADAPTER: Separate transcript fields from council meeting fields
        const { audioUrl, videoUrl, muxPlaybackId, ...councilData } = meetingData;
        
        await prisma.$transaction(async (tx) => {
            // Update Transcript fields if provided
            if (audioUrl !== undefined || videoUrl !== undefined || muxPlaybackId !== undefined) {
                await tx.transcript.update({
                    where: { workspaceId_id: { workspaceId: cityId, id } },
                    data: {
                        ...(audioUrl !== undefined && { audioUrl }),
                        ...(videoUrl !== undefined && { videoUrl }),
                        ...(muxPlaybackId !== undefined && { muxPlaybackId })
                    }
                });
            }
            
            // Update CouncilMeeting fields if there are any
            if (Object.keys(councilData).length > 0) {
                await tx.councilMeeting.update({
                    where: { cityId_id: { cityId, id } },
                    data: councilData
                });
            }
        });
        
        // Return the updated meeting with transcript data
        const updatedMeeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
            include: {
                administrativeBody: true,
                transcript: true
            }
        });
        
        if (!updatedMeeting) {
            throw new Error('Meeting not found after update');
        }
        
        // Flatten transcript data for backward compatibility
        return {
            ...updatedMeeting,
            administrativeBody: updatedMeeting.administrativeBody,
            transcript: updatedMeeting.transcript ? {
                audioUrl: updatedMeeting.transcript.audioUrl,
                videoUrl: updatedMeeting.transcript.videoUrl,
                muxPlaybackId: updatedMeeting.transcript.muxPlaybackId,
                released: updatedMeeting.transcript.released
            } : null
        };
    } catch (error) {
        console.error('Error editing council meeting:', error);
        throw new Error('Failed to edit council meeting');
    }
}

export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    const startTime = performance.now();
    try {
        // ADAPTER: Call generic transcript method
        const transcript = await getTranscript(cityId, id);
        const endTime = performance.now();

        if (!transcript || !transcript.councilMeeting) {
            return null;
        }

        // Check authorization for unreleased transcripts
        if (!transcript.released && !(await isUserAuthorizedToEdit({ cityId }))) {
            return null;
        }

        // Flatten to old shape for backward compatibility
        return {
            ...transcript.councilMeeting,
            administrativeBody: transcript.councilMeeting.administrativeBody,
            transcript: {
                audioUrl: transcript.audioUrl,
                videoUrl: transcript.videoUrl,
                muxPlaybackId: transcript.muxPlaybackId,
                released: transcript.released
            }
        };
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

export async function getCouncilMeetingsForCity(cityId: string, { includeUnreleased, limit }: { includeUnreleased?: boolean; limit?: number } = {}): Promise<CouncilMeetingWithAdminBodyAndSubjects[]> {

    try {
        // First, get meetings with subjects and basic relationships
        const meetings = await prisma.councilMeeting.findMany({
            where: { 
                cityId,
                transcript: {
                    released: includeUnreleased ? undefined : true
                }
            },
            orderBy: [
                { dateTime: 'desc' },
                { createdAt: 'desc' }
            ],
            ...(limit && { take: limit }),
            include: {
                subjects: {
                    orderBy: [
                        // Ensure hot subjects are first in the list 
                        { hot: 'desc' },
                        // Secondary ordering by agenda item index when available
                        { agendaItemIndex: 'asc' },
                        { name: 'asc' }
                    ],
                    include: {
                        topic: true,
                        // Include speaker segments through the junction table
                        speakerSegments: true // This gets all SubjectSpeakerSegment records
                    }
                },
                administrativeBody: true,
                transcript: true
            }
        });

        // Flatten transcript data for backward compatibility
        return meetings.map(meeting => ({
            ...meeting,
            administrativeBody: meeting.administrativeBody,
            transcript: meeting.transcript ? {
                audioUrl: meeting.transcript.audioUrl,
                videoUrl: meeting.transcript.videoUrl,
                muxPlaybackId: meeting.transcript.muxPlaybackId,
                released: meeting.transcript.released
            } : null
        }));
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

export async function toggleMeetingRelease(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        // ADAPTER: Call generic transcript release toggle
        await toggleTranscriptReleaseGeneric(cityId, id, released);
        
        // Get updated meeting for return (maintain old signature)
        const updatedMeeting = await getCouncilMeeting(cityId, id);
        
        // Council-specific side effects
        revalidateTag(`city:${cityId}:meetings`);
        revalidatePath(`/${cityId}`, "layout");
        
        return updatedMeeting!;
    } catch (error) {
        console.error('Error toggling council meeting release:', error);
        throw new Error('Failed to toggle council meeting release');
    }
}

export async function getCouncilMeetingsCountForCity(cityId: string): Promise<number> {
    try {
        const count = await prisma.councilMeeting.count({
            where: {
                cityId,
                transcript: {
                    released: true
                }
            }
        });
        return count;
    } catch (error) {
        console.error('Error counting council meetings for city:', error);
        throw new Error('Failed to count council meetings for city');
    }
}

export async function getMeetingDataForOG(cityId: string, meetingId: string) {
    try {
        const data = await prisma.councilMeeting.findFirst({
            where: {
                cityId,
                id: meetingId,
                transcript: {
                    released: true
                }
            },
            select: {
                name: true,
                dateTime: true,
                subjects: {
                    select: {
                        id: true,
                        name: true,
                        hot: true,
                        topic: {
                            select: {
                                colorHex: true
                            }
                        }
                    }
                },
                city: {
                    select: {
                        name_municipality: true,
                        logoImage: true
                    }
                }
            }
        });

        if (!data) return null;
        return data;
    } catch (error) {
        console.error('Error fetching meeting data for OG:', error);
        throw new Error('Failed to fetch meeting data for OG');
    }
}

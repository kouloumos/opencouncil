"use server";
import prisma from './prisma';
import { withUserAuthorizedToEdit } from '../auth';
import { CouncilMeeting, City, SpeakerSegment, Utterance, SpeakerTag, TopicLabel, Topic, Summary, Prisma } from '@prisma/client';
import { PersonWithRelations } from './people';
import { isRoleActiveAt } from '../utils';

// Define the standard include for speaker segments for transcript (simple speakerTag)
const speakerSegmentTranscriptInclude = {
    utterances: {
        orderBy: { startTimestamp: 'asc' as const }
    },
    speakerTag: true,
    summary: true,
    topicLabels: {
        include: {
            topic: true
        }
    }
} satisfies Prisma.SpeakerSegmentInclude;

// Define the include for speaker segments with full relations (for queries)
// const speakerSegmentWithRelationsInclude = {
//     utterances: {
//         orderBy: { startTimestamp: 'asc' as const }
//     },
//     speakerTag: {
//         include: {
//             speaker: {
//                 include: {
//                     person: {
//                         include: {
//                             roles: {
//                                 include: {
//                                     party: true,
//                                     city: true,
//                                     administrativeBody: true
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }
//         }
//     },
//     summary: true,
//     topicLabels: {
//         include: {
//             topic: true
//         }
//     }
// } satisfies Prisma.SpeakerSegmentInclude;

export type SpeakerSegmentForTranscript = Prisma.SpeakerSegmentGetPayload<{
    include: typeof speakerSegmentTranscriptInclude
}>;

// export type SpeakerSegmentWithRelations = Prisma.SpeakerSegmentGetPayload<{
//     include: typeof speakerSegmentWithRelationsInclude
// }>;

export type SegmentWithRelations = {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
    meeting: CouncilMeeting & {
        city: City;
    };
    person: PersonWithRelations | null;
    text: string;
    summary: { text: string } | null;
};

// const speakerSegmentWithRelationsInclude = {
//     utterances: true,
//     speakerTag: {
//         include: {
//             person: {
//                 include: {
//                     roles: {
//                         include: {
//                             party: true,
//                             city: true,
//                             administrativeBody: true
//                         }
//                     }
//                 }
//             }
//         }
//     },
//     summary: true,
//     topicLabels: {
//         include: {
//             topic: true
//         }
//     }
// } satisfies Prisma.SpeakerSegmentInclude;

export async function createEmptySpeakerSegmentAfter(
    afterSegmentId: string,
    cityId: string,
    meetingId: string
): Promise<SpeakerSegmentForTranscript> {
    // First get the segment we're inserting after to get its end timestamp and speaker tag info
    const currentSegment = await prisma.speakerSegment.findUnique({
        where: { id: afterSegmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!currentSegment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId });

    // Find the next segment to ensure we place the new segment correctly
    const nextSegment = await prisma.speakerSegment.findFirst({
        where: {
            transcriptId: meetingId,
            workspaceId: cityId,
            startTimestamp: { gt: currentSegment.endTimestamp }
        },
        orderBy: { startTimestamp: 'asc' }
    });

    // Create a new segment starting at the end of the previous one
    const startTimestamp = currentSegment.endTimestamp + 0.01; // ugh
    const endTimestamp = nextSegment
        ? Math.min(startTimestamp + 0.01, nextSegment.startTimestamp)
        : startTimestamp + 0.01;

    // Create a new speaker tag based on the previous one
    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New speaker segment",
            // No speakerId - will be set later if needed
        }
    });

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            workspaceId: cityId,
            transcriptId: meetingId,
            speakerTagId: newSpeakerTag.id
        },
        include: speakerSegmentTranscriptInclude
    });

    console.log(`Created a new speaker segment starting at ${startTimestamp} and ending at ${endTimestamp}. Previous segment ended at ${currentSegment.endTimestamp}, next segment starts at ${nextSegment?.startTimestamp}`);

    return newSegment;
}

export async function createEmptySpeakerSegmentBefore(
    beforeSegmentId: string,
    cityId: string,
    meetingId: string
): Promise<SpeakerSegmentForTranscript> {
    // First get the segment we're inserting before to get its start timestamp
    const firstSegment = await prisma.speakerSegment.findUnique({
        where: { id: beforeSegmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!firstSegment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId });

    // Calculate timestamps for the new segment
    // We want to create a small segment before the first segment
    const endTimestamp = firstSegment.startTimestamp - 0.01;
    const startTimestamp = Math.max(0, endTimestamp - 0.01);

    // If the first segment starts too close to 0, we need to adjust or throw an error
    if (startTimestamp < 0 || startTimestamp >= endTimestamp) {
        throw new Error('Cannot create segment before first segment: insufficient timestamp space');
    }

    // Create a new speaker tag
    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New speaker segment",
            speakerId: null // Reset the person association for the new tag
        }
    });

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            workspaceId: cityId,
            transcriptId: meetingId,
            speakerTagId: newSpeakerTag.id
        },
        include: speakerSegmentTranscriptInclude
    });

    console.log(`Created a new speaker segment before first segment: ${startTimestamp} - ${endTimestamp}. First segment starts at ${firstSegment.startTimestamp}`);

    return newSegment;
}

async function moveUtterancesToSegment(
    utteranceId: string,
    currentSegmentId: string,
    direction: 'previous' | 'next'
): Promise<{ previousSegment?: SpeakerSegmentForTranscript | null; currentSegment?: SpeakerSegmentForTranscript | null; nextSegment?: SpeakerSegmentForTranscript | null }> {
    // Get the current segment and its utterances
    const currentSegment = await prisma.speakerSegment.findUnique({
        where: { id: currentSegmentId },
        include: {
            utterances: {
                orderBy: { startTimestamp: 'asc' }
            }
        }
    });

    if (!currentSegment) {
        throw new Error('Current segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: currentSegment.workspaceId });

    // Find the target segment (previous or next)
    const targetSegment = await prisma.speakerSegment.findFirst({
        where: {
            transcriptId: currentSegment.transcriptId,
            workspaceId: currentSegment.workspaceId,
            ...(direction === 'previous'
                ? { endTimestamp: { lt: currentSegment.startTimestamp } }
                : { startTimestamp: { gt: currentSegment.endTimestamp } }
            )
        },
        orderBy: direction === 'previous'
            ? { endTimestamp: 'desc' }
            : { startTimestamp: 'asc' },
        include: {
            utterances: {
                orderBy: { startTimestamp: 'asc' }
            }
        }
    });

    if (!targetSegment) {
        throw new Error(`No ${direction} segment found`);
    }

    // Find the index of the target utterance
    const utteranceIndex = currentSegment.utterances.findIndex(u => u.id === utteranceId);
    if (utteranceIndex === -1) {
        throw new Error('Utterance not found in segment');
    }

    // Get utterances to move and remaining utterances
    const [utterancesToMove, remainingUtterances] = direction === 'previous'
        ? [
            currentSegment.utterances.slice(0, utteranceIndex + 1),
            currentSegment.utterances.slice(utteranceIndex + 1)
        ]
        : [
            currentSegment.utterances.slice(utteranceIndex),
            currentSegment.utterances.slice(0, utteranceIndex)
        ];

    // Update the segments and move the utterances
    await prisma.$transaction([
        // Move utterances to target segment
        prisma.utterance.updateMany({
            where: { id: { in: utterancesToMove.map(u => u.id) } },
            data: { speakerSegmentId: targetSegment.id }
        }),
        // Update target segment's timestamp
        prisma.speakerSegment.update({
            where: { id: targetSegment.id },
            data: targetSegment.utterances.length === 0
                ? direction === 'previous'
                    ? {
                        startTimestamp: utterancesToMove[0].startTimestamp,
                        endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp
                    }
                    : {
                        startTimestamp: utterancesToMove[0].startTimestamp,
                        endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp
                    }
                : direction === 'previous'
                    ? { endTimestamp: utterancesToMove[utterancesToMove.length - 1].endTimestamp }
                    : { startTimestamp: utterancesToMove[0].startTimestamp }
        }),
        // Update current segment's timestamp
        prisma.speakerSegment.update({
            where: { id: currentSegment.id },
            data: remainingUtterances.length === 0
                ? direction === 'previous'
                    ? { startTimestamp: currentSegment.startTimestamp, endTimestamp: currentSegment.startTimestamp + 0.01 }
                    : { startTimestamp: currentSegment.endTimestamp - 0.01, endTimestamp: currentSegment.endTimestamp }
                : direction === 'previous'
                    ? { startTimestamp: remainingUtterances[0].startTimestamp }
                    : { endTimestamp: remainingUtterances[remainingUtterances.length - 1].endTimestamp }
        })
    ]);

    const updatedSegments = await Promise.all([
        getSegmentWithIncludes(currentSegment.id),
        getSegmentWithIncludes(targetSegment.id)
    ]);

    return direction === 'previous'
        ? { previousSegment: updatedSegments[1], currentSegment: updatedSegments[0] }
        : { currentSegment: updatedSegments[0], nextSegment: updatedSegments[1] };
}

export async function updateSegmentTimestamps(segmentId: string) {
    const segment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: { utterances: true }
    });

    if (!segment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: segment.workspaceId });

    const earliestStart = Math.min(...segment.utterances.map(u => u.startTimestamp));
    const latestEnd = Math.max(...segment.utterances.map(u => u.endTimestamp));

    await prisma.speakerSegment.update({
        where: { id: segmentId },
        data: { startTimestamp: earliestStart, endTimestamp: latestEnd }
    });
}

export async function moveUtterancesToPreviousSegment(
    utteranceId: string,
    currentSegmentId: string,
) {
    return moveUtterancesToSegment(utteranceId, currentSegmentId, 'previous');
}

export async function moveUtterancesToNextSegment(
    utteranceId: string,
    currentSegmentId: string,
) {
    return moveUtterancesToSegment(utteranceId, currentSegmentId, 'next');
}

async function getSegmentWithIncludes(segmentId: string): Promise<SpeakerSegmentForTranscript | null> {
    return await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: speakerSegmentTranscriptInclude
    });
}

export async function deleteEmptySpeakerSegment(
    segmentId: string,
    cityId: string
) {
    // Get the segment and verify it's empty
    const segment = await prisma.speakerSegment.findUnique({
        where: { id: segmentId },
        include: {
            utterances: true,
            speakerTag: true
        }
    });

    if (!segment) {
        throw new Error('Segment not found');
    }

    if (segment.workspaceId !== cityId) {
        throw new Error('City ID mismatch');
    }

    await withUserAuthorizedToEdit({ cityId });

    const text = segment.utterances.map((u) => u.text).join(" ");
    const isOnlyWhitespace = text.trim().length === 0;

    if (segment.utterances.length > 0 && !isOnlyWhitespace) {
        throw new Error('Cannot delete non-empty segment');
    }

    // Delete the segment and its speaker tag
    console.log(`Deleting segment ${segmentId}`);
    await prisma.speakerSegment.delete({
        where: { id: segmentId }
    })

    return segmentId;
}

export async function getLatestSegmentsForSpeaker(
    personId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null
): Promise<{ results: SegmentWithRelations[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: {
                speakerTag: {
                    speaker: {
                        person: {
                            id: personId
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                transcript: {
                    councilMeeting: administrativeBodyId ? {
                        administrativeBodyId: administrativeBodyId
                    } : {}
                }
            },
            include: {
                transcript: {
                    include: {
                        councilMeeting: {
                            include: {
                                city: true
                            }
                        }
                    }
                },
                speakerTag: {
                    include: {
                        speaker: {
                            include: {
                                person: {
                                    include: {
                                        roles: {
                                            include: {
                                                party: true,
                                                city: true,
                                                administrativeBody: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                utterances: true,
                summary: true,
            },
            orderBy: [
                {
                    transcript: {
                        councilMeeting: {
                            dateTime: 'desc'
                        }
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }),
        prisma.speakerSegment.count({
            where: {
                speakerTag: {
                    speaker: {
                        person: {
                            id: personId
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                transcript: {
                    councilMeeting: administrativeBodyId ? {
                        administrativeBodyId: administrativeBodyId
                    } : {}
                }
            }
        })
    ]);

    const results = segments
        .filter(segment => segment.transcript?.councilMeeting) // Only include segments with council meetings
        .map(segment => ({
            id: segment.id,
            startTimestamp: segment.startTimestamp,
            endTimestamp: segment.endTimestamp,
            meeting: segment.transcript!.councilMeeting!,
            person: segment.speakerTag.speaker?.person ? {
                ...segment.speakerTag.speaker.person,
                image: segment.speakerTag.speaker.image ?? null
            } : null,
            text: segment.utterances.map((u: Utterance) => u.text).join(' '),
            summary: segment.summary ? { text: segment.summary.text } : null
        }))
        // Only include segments with at least 100 characters
        .filter(segment => segment.text.length >= 100);

    return {
        results,
        totalCount
    };
}

export async function getLatestSegmentsForParty(
    partyId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyId?: string | null
): Promise<{ results: SegmentWithRelations[], totalCount: number }> {
    const skip = (page - 1) * pageSize;

    const [segments, totalCount] = await Promise.all([
        prisma.speakerSegment.findMany({
            where: {
                speakerTag: {
                    speaker: {
                        person: {
                            roles: {
                                some: {
                                    partyId: partyId
                                }
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                transcript: {
                    councilMeeting: administrativeBodyId ? {
                        administrativeBodyId: administrativeBodyId
                    } : {}
                }
            },
            include: {
                transcript: {
                    include: {
                        councilMeeting: {
                            include: {
                                city: true
                            }
                        }
                    }
                },
                speakerTag: {
                    include: {
                        speaker: {
                            include: {
                                person: {
                                    include: {
                                        roles: {
                                            where: {
                                                partyId: partyId
                                            },
                                            include: {
                                                party: true,
                                                city: true,
                                                administrativeBody: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                utterances: true,
                summary: true,
            },
            orderBy: [
                {
                    transcript: {
                        councilMeeting: {
                            dateTime: 'desc'
                        }
                    }
                },
                {
                    startTimestamp: 'desc'
                }
            ],
            take: pageSize,
            skip
        }),
        prisma.speakerSegment.count({
            where: {
                speakerTag: {
                    speaker: {
                        person: {
                            roles: {
                                some: {
                                    partyId: partyId
                                }
                            }
                        }
                    }
                },
                utterances: {
                    some: {
                        text: {
                            gt: ''
                        }
                    }
                },
                transcript: {
                    councilMeeting: administrativeBodyId ? {
                        administrativeBodyId: administrativeBodyId
                    } : {}
                }
            }
        })
    ]);

    const results = segments
        .filter(segment => {
            // Only include segments with council meetings
            if (!segment.transcript?.councilMeeting) return false;
            
            // Safe check for minimum text length
            const text = segment.utterances.map((u: Utterance) => u.text).join(' ');
            // Safe check for person and roles
            const hasPerson = segment.speakerTag.speaker?.person != null;
            const hasRoles = Array.isArray(segment.speakerTag.speaker?.person?.roles);
            // Only include segments with at least 100 characters and a person with roles
            return text.length >= 100 && hasPerson && hasRoles;
        })
        .flatMap(segment => {
            const text = segment.utterances.map((u: Utterance) => u.text).join(' ');
            const person = segment.speakerTag.speaker?.person;

            // At this point we know person exists thanks to our filter
            // But TypeScript might not recognize this, so we add a safety check
            if (!person || !Array.isArray(person.roles) || !segment.transcript?.councilMeeting) {
                return [];
            }

            const meetingDate = new Date(segment.transcript.councilMeeting.dateTime);

            // Check for active role at meeting time
            const hasActiveRole = person.roles.some(role => isRoleActiveAt(role, meetingDate));

            // Skip if no active role
            if (!hasActiveRole) {
                return [];
            }

            return [{
                id: segment.id,
                startTimestamp: segment.startTimestamp,
                endTimestamp: segment.endTimestamp,
                meeting: segment.transcript.councilMeeting,
                person: {
                    ...person,
                    image: segment.speakerTag.speaker?.image ?? null
                },
                text: text,
                summary: segment.summary ? { text: segment.summary.text } : null
            }];
        });

    return {
        results,
        totalCount
    };
}

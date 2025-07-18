import prisma from './prisma';
import {
    Subject,
    SubjectSpeakerSegment,
    SpeakerSegment,
    Highlight,
    Location,
    Topic,
    City,
    CouncilMeeting,
} from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { getCity } from './cities';
import { getCouncilMeeting } from './meetings';
import { getPeopleForCity } from './people';
import { getStatisticsFor, Statistics } from '@/lib/statistics';

// Type for location with coordinates
export type LocationWithCoordinates = Location & {
    coordinates?: {
        x: number;
        y: number;
    };
};

export type SubjectWithRelations = Subject & {
    speakerSegments: (SubjectSpeakerSegment & {
        speakerSegment: SpeakerSegment;
    })[];
    highlights: Highlight[];
    location: LocationWithCoordinates | null;
    topic: Topic | null;
    introducedBy: PersonWithRelations | null;
};

export type SubjectOgData = {
    subject: SubjectWithRelations;
    city: City;
    meeting: CouncilMeeting;
    statistics?: Statistics;
    people: PersonWithRelations[];
};

export async function getAllSubjects(): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                },
                highlights: true,
                location: true,
                topic: true,
                introducedBy: {
                    include: {
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true,
                            },
                        },
                    },
                },
            },
        });
        return subjects;
    } catch (error) {
        console.error('Error fetching all subjects:', error);
        throw new Error('Failed to fetch all subjects');
    }
}

export async function getSubjectsForMeeting(cityId: string, councilMeetingId: string): Promise<SubjectWithRelations[]> {
    try {
        // First get the subjects with all relations using Prisma
        const subjects = await prisma.subject.findMany({
            where: {
                cityId,
                councilMeetingId,
            },
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
                introducedBy: {
                    include: {
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true,
                            },
                        },
                    },
                },
                highlights: true,
                location: true,
                topic: true,
            },
        });

        // Then get the coordinates for locations that exist
        const locationIds = subjects.filter(s => s.location).map(s => s.location!.id);

        if (locationIds.length > 0) {
            const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds}::text[])
                AND type = 'point'
            `;

            // Merge coordinates into the subjects
            return subjects.map(subject => ({
                ...subject,
                location: subject.location
                    ? {
                        ...subject.location,
                        coordinates: locationCoordinates.find(l => l.id === subject.location!.id),
                    }
                    : null,
            }));
        }

        return subjects;
    } catch (error) {
        console.error('Error fetching subjects for meeting:', error);
        throw new Error('Failed to fetch subjects for meeting');
    }
}

/**
 * Get a single subject with all its relations
 */
export async function getSubject(subjectId: string): Promise<SubjectWithRelations | null> {
    try {
        const subject = await prisma.subject.findUnique({
            where: {
                id: subjectId,
            },
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
                introducedBy: {
                    include: {
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true,
                            },
                        },
                    },
                },
                highlights: true,
                location: true,
                topic: true,
            },
        });

        if (!subject || !subject.location) {
            return subject;
        }

        // Get coordinates if the subject has a location
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ${subject.location.id}
            AND type = 'point'
        `;

        // Return the subject with location coordinates if available
        return {
            ...subject,
            location: {
                ...subject.location,
                coordinates: locationCoordinates[0],
            },
        };
    } catch (error) {
        console.error('Error fetching subject:', error);
        throw new Error('Failed to fetch subject');
    }
}

/**
 * Get subject data for OpenGraph image generation
 */
export async function getSubjectDataForOG(
    cityId: string,
    meetingId: string,
    subjectId: string,
): Promise<SubjectOgData | null> {
    try {
        const [subject, city, meeting] = await Promise.all([
            getSubject(subjectId),
            getCity(cityId),
            getCouncilMeeting(cityId, meetingId),
        ]);

        if (!subject || !city || !meeting) return null;

        const statistics = await getStatisticsFor({ subjectId: subject.id }, ['person', 'party']);

        const people = await getPeopleForCity(cityId);

        return {
            subject,
            city,
            meeting,
            statistics,
            people,
        };
    } catch (error) {
        console.error('Error fetching subject data for OG:', error);
        return null;
    }
}

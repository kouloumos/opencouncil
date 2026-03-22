import prisma from './prisma';
import {
    Prisma,
    Location,
    City,
} from '@prisma/client';
import { getCity } from './cities';
import { CouncilMeetingWithAdminBody, getCouncilMeeting } from './meetings';
import { getPeopleForCity, PersonWithRelations } from './people';
import { getStatisticsFor, Statistics } from '@/lib/statistics';

// Type for location with coordinates
export type LocationWithCoordinates = Location & {
    coordinates?: {
        x: number;
        y: number;
    };
};

// Define the standard include for subjects using the satisfies pattern
const subjectWithRelationsInclude = {
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
            speaker: true
        },
    },
} satisfies Prisma.SubjectInclude;

// Use Prisma's inferred type, but override introducedBy to use PersonWithRelations
type SubjectWithRelationsBase = Prisma.SubjectGetPayload<{
    include: typeof subjectWithRelationsInclude;
}>;

export type SubjectWithRelations = Omit<SubjectWithRelationsBase, 'introducedBy' | 'location'> & {
    location: LocationWithCoordinates | null;
    introducedBy: PersonWithRelations | null;
};

export type SubjectOgData = {
    subject: SubjectWithRelations;
    city: City;
    meeting: CouncilMeetingWithAdminBody;
    statistics?: Statistics;
    people: PersonWithRelations[];
};

/**
 * Helper function to flatten the introducedBy person data
 * Converts the nested speaker.image to top-level property
 */
function flattenSubjectPerson(subject: SubjectWithRelationsBase): SubjectWithRelations {
    return {
        ...subject,
        introducedBy: subject.introducedBy ? {
            ...subject.introducedBy,
            image: subject.introducedBy.speaker?.image ?? null,
        } : null,
    };
}

export async function getAllSubjects(): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            include: subjectWithRelationsInclude,
        });
        return subjects.map(flattenSubjectPerson);
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
                ...subjectWithRelationsInclude,
                speakerSegments: {
                    ...subjectWithRelationsInclude.speakerSegments,
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
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

            // Merge coordinates into the subjects and flatten person data
            return subjects.map(subject => ({
                ...flattenSubjectPerson(subject),
                location: subject.location
                    ? {
                        ...subject.location,
                        coordinates: locationCoordinates.find(l => l.id === subject.location!.id),
                    }
                    : null,
            }));
        }

        return subjects.map(flattenSubjectPerson);
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
                ...subjectWithRelationsInclude,
                speakerSegments: {
                    ...subjectWithRelationsInclude.speakerSegments,
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
            },
        });

        if (!subject) {
            return null;
        }

        if (!subject.location) {
            return flattenSubjectPerson(subject);
        }

        // Get coordinates if the subject has a location
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ${subject.location.id}
            AND type = 'point'
        `;

        // Return the subject with location coordinates and flattened person data
        return {
            ...flattenSubjectPerson(subject),
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

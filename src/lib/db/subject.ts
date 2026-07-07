import prisma from './prisma';
import {
    Subject,
    SubjectSpeakerSegment,
    SpeakerSegment,
    SpeakerContribution,
    Decision,
    Highlight,
    Location,
    Topic,
    VoteType,
    Prisma,
    Realm,
    AdministrativeBodyType,
} from '@prisma/client';
import { PersonWithRelations } from '@/lib/db/people';
import { extractUtteranceIds } from '@/lib/utils/references';
import { roleWithRelationsInclude } from './types/roles';

// Shared include blocks for Subject queries
const contributionsInclude = {
    include: {
        speaker: {
            include: {
                roles: roleWithRelationsInclude
            },
        },
    },
    orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
} satisfies Prisma.SpeakerContributionFindManyArgs;

const introducedByInclude = {
    include: {
        roles: roleWithRelationsInclude
    },
} satisfies Prisma.PersonDefaultArgs;

/** Person select with elected order — shared by votes and attendance queries */
const personWithElectedOrderSelect = {
    select: {
        id: true,
        name: true,
        roles: {
            select: { electedOrder: true, administrativeBodyId: true },
            where: { electedOrder: { not: null } },
        },
    },
} satisfies Prisma.PersonDefaultArgs;

const votesInclude = {
    select: {
        voteType: true,
        person: personWithElectedOrderSelect,
    },
    orderBy: { person: { name: 'asc' as const } },
} satisfies Prisma.SubjectVoteFindManyArgs;

const attendanceInclude = {
    select: {
        status: true,
        person: personWithElectedOrderSelect,
    },
} satisfies Prisma.SubjectAttendanceFindManyArgs;

// Type for location with coordinates
export type LocationWithCoordinates = Location & {
    coordinates?: {
        x: number;
        y: number;
    };
};

export type SubjectWithRelations = Subject & {
    contributions: (SpeakerContribution & {
        speaker: PersonWithRelations | null;
    })[];
    // Keep speakerSegments for backward compatibility during transition
    speakerSegments: (SubjectSpeakerSegment & {
        speakerSegment: SpeakerSegment;
    })[];
    highlights: Highlight[];
    location: LocationWithCoordinates | null;
    topic: Topic | null;
    introducedBy: PersonWithRelations | null;
    discussedIn: (Subject & { topic: Topic | null }) | null;
    decision: Decision | null;
    votes: { voteType: VoteType; person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] } }[];
    attendance: { status: 'PRESENT' | 'ABSENT'; person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] } }[];
};

/**
 * Total subjects per city across the city's released meetings, as a { cityId: count }
 * map. Powers the landing's Δήμοι tab, which shows unfiltered city totals (independent
 * of the map's date-range / filter selection). Scoped to the active realm and officially
 * supported cities — the same visibility as the map subject endpoints — so counts never
 * include subjects that can't appear as pins on that map.
 */
export async function getSubjectCountsByCity(realm: Realm): Promise<Record<string, number>> {
    const grouped = await prisma.subject.groupBy({
        by: ['cityId'],
        // Same visibility as the map subject endpoints: officially-supported, released meetings
        // whose date is in the past (never future-dated), so the Δήμοι tab total matches the map.
        where: {
            // Only subjects that were actually discussed (have at least one speaker contribution).
            contributions: { some: {} },
            councilMeeting: {
                released: true,
                dateTime: { lte: new Date() },
                city: { officialSupport: true, realm },
            },
        },
        _count: { _all: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.cityId, g._count._all]));
}

// ── Landing map subjects ──────────────────────────────────────────────────────
// PROTOTYPE (review slice): single source for the landing map's subject query + wire
// type. Both the interactive /api/map/subjects route AND the server-side initial load
// import these, so the shape is defined once (Prisma-derived) and never re-declared
// client-side. `getGeneralSubjects` (non-located) would share `buildMapSubjectWhere`
// with `located: false`, collapsing the ~30-line date-window + where duplication that
// currently lives in both route handlers.

export type MapSubjectFilters = {
    monthsBack?: number;
    daysBack?: number | null;
    allTime?: boolean;
    topicIds?: string[];
    cityIds?: string[];
    bodyTypes?: AdministrativeBodyType[];
    dateFrom?: string | null;
    dateTo?: string | null;
    /** true → located subjects (map pins); false → non-located (general/city list). */
    located?: boolean;
};

/** The subject-map wire shape — imported by the route AND the client (no re-declaration). */
export type MapSubjectRow = {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    bodyName?: string | null;
    adminBodyType?: AdministrativeBodyType | null;
    locationText?: string;
    locationType?: string;
    topicId?: string | null;
    topicName?: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
};

const mapSubjectInclude = {
    councilMeeting: {
        select: {
            dateTime: true,
            name: true,
            administrativeBody: { select: { name: true, type: true } },
        },
    },
    topic: { select: { name: true, name_en: true, colorHex: true, icon: true } },
    location: { select: { text: true, type: true } },
    speakerSegments: {
        select: {
            speakerSegment: {
                select: {
                    startTimestamp: true,
                    endTimestamp: true,
                    speakerTag: { select: { id: true } },
                },
            },
        },
    },
} satisfies Prisma.SubjectInclude;

/**
 * Shared where-clause for the landing map subject queries. Realm is REQUIRED, so a
 * caller cannot forget to scope by tenant. `located` picks the map-pin variant
 * (locationId not null) vs the general/city-list variant (locationId null) — the only
 * real difference between the two endpoints that previously duplicated this block.
 */
export function buildMapSubjectWhere(realm: Realm, f: MapSubjectFilters): Prisma.SubjectWhereInput {
    const now = new Date();
    const dateTime: { gte?: Date; lte: Date } = { lte: now };
    if (f.dateFrom || f.dateTo) {
        if (f.dateFrom) dateTime.gte = new Date(f.dateFrom);
        if (f.dateTo) {
            const to = new Date(`${f.dateTo}T23:59:59.999`);
            if (to < now) dateTime.lte = to;
        }
    } else if (!f.allTime) {
        const threshold = new Date();
        if (f.daysBack && f.daysBack > 0) threshold.setDate(threshold.getDate() - f.daysBack);
        else threshold.setMonth(threshold.getMonth() - (f.monthsBack ?? 6));
        dateTime.gte = threshold;
    }
    return {
        locationId: f.located === false ? null : { not: null },
        contributions: { some: {} },
        ...(f.topicIds?.length ? { topicId: { in: f.topicIds } } : {}),
        ...(f.cityIds?.length ? { cityId: { in: f.cityIds } } : {}),
        councilMeeting: {
            released: true,
            dateTime,
            city: { officialSupport: true, realm },
            ...(f.bodyTypes?.length ? { administrativeBody: { type: { in: f.bodyTypes } } } : {}),
        },
    };
}

/**
 * Located subjects for the landing map, realm-scoped. Returns the wire shape directly —
 * the /api/map/subjects route is a thin wrapper over this AND the server component calls
 * it for the initial load, so the query lives once and `MapSubjectRow` is the single type.
 */
export async function getMapSubjects(realm: Realm, filters: MapSubjectFilters): Promise<MapSubjectRow[]> {
    const subjects = await prisma.subject.findMany({
        where: buildMapSubjectWhere(realm, { ...filters, located: true }),
        include: mapSubjectInclude,
    });

    const locationIds = subjects.map((s) => s.locationId).filter((id): id is string => Boolean(id));
    if (locationIds.length === 0) return [];

    const geometries = await prisma.$queryRaw<{ id: string; geometry: string }[]>`
        SELECT id, ST_AsGeoJSON(coordinates, 15, 0)::text AS geometry
        FROM "Location"
        WHERE id IN (${Prisma.join(locationIds)})
    `;
    const geometryMap = new Map<string, GeoJSON.Geometry>(
        geometries.map((g) => {
            const geom = JSON.parse(g.geometry) as GeoJSON.Geometry;
            // PostGIS may return [lat, lon]; GeoJSON needs [lon, lat] (swap Greek Points).
            if (geom.type === 'Point' && geom.coordinates.length === 2) {
                const [first, second] = geom.coordinates;
                if (first > 30 && first < 42 && second > 19 && second < 30) {
                    geom.coordinates = [second, first];
                }
            }
            return [g.id, geom] as const;
        }),
    );

    return subjects
        .filter((s) => s.locationId && geometryMap.has(s.locationId))
        .map((s): MapSubjectRow => {
            const segs = s.speakerSegments ?? [];
            const seconds = segs.reduce(
                (sum, sss) => sum + (sss.speakerSegment.endTimestamp - sss.speakerSegment.startTimestamp),
                0,
            );
            const speakers = new Set(segs.map((sss) => sss.speakerSegment.speakerTag.id)).size;
            return {
                id: s.id,
                name: s.name,
                description: s.description,
                cityId: s.cityId,
                councilMeetingId: s.councilMeetingId,
                meetingDate: s.councilMeeting?.dateTime?.toISOString(),
                meetingName: s.councilMeeting?.name,
                bodyName: s.councilMeeting?.administrativeBody?.name ?? null,
                adminBodyType: s.councilMeeting?.administrativeBody?.type ?? null,
                locationText: s.location?.text,
                locationType: s.location?.type,
                topicId: s.topicId,
                topicName: s.topic?.name,
                topicColor: s.topic?.colorHex || '#627BBC',
                topicIcon: s.topic?.icon,
                discussionTimeSeconds: Math.round(seconds),
                speakerCount: speakers,
                geometry: geometryMap.get(s.locationId!)!,
            };
        });
}

export async function getAllSubjects(): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                contributions: contributionsInclude,
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                },
                highlights: true,
                location: true,
                topic: true,
                introducedBy: introducedByInclude,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
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
                contributions: contributionsInclude,
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
                introducedBy: introducedByInclude,
                highlights: true,
                location: true,
                topic: true,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
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
                contributions: contributionsInclude,
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
                introducedBy: introducedByInclude,
                highlights: true,
                location: true,
                topic: true,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true,
                    },
                },
                votes: votesInclude,
                attendance: attendanceInclude,
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
 * Extract utterance IDs from contribution references for highlight creation
 * @param contributions - Array of speaker contributions
 * @returns Deduplicated array of utterance IDs
 */
export function extractUtteranceIdsFromContributions(
    contributions: { text: string }[]
): string[] {
    const allIds: string[] = [];
    for (const contribution of contributions) {
        const ids = extractUtteranceIds(contribution.text);
        allIds.push(...ids);
    }
    return [...new Set(allIds)]; // Deduplicate
}

/**
 * Get all utterances tagged with a subject for debugging
 * Only accessible to superadmins
 */
export async function getUtterancesForSubject(subjectId: string) {
    const { getCurrentUser } = await import('@/lib/auth');
    const user = await getCurrentUser();

    // Only superadmins can access debug data
    if (!user?.isSuperAdmin) {
        return null;
    }

    const utterances = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: subjectId,
            discussionStatus: {
                in: ['SUBJECT_DISCUSSION', 'PROCEDURAL_VOTE', 'VOTE']
            }
        },
        select: {
            id: true,
            text: true,
            startTimestamp: true,
            endTimestamp: true,
            discussionStatus: true,
            speakerSegment: {
                select: {
                    speakerTag: {
                        select: {
                            label: true,
                            person: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: {
            startTimestamp: 'asc'
        }
    });

    return utterances;
}

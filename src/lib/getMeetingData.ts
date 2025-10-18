import { unstable_cache } from 'next/cache';
import { getCouncilMeeting, CouncilMeetingWithAdminBody } from '@/lib/db/meetings';
import { getTranscript, Transcript } from '@/lib/db/transcript';
import { CityWithGeometry, getCitiesWithGeometry, getCity } from '@/lib/db/cities';
import { PersonWithRelations, getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getHighlightsForMeeting, HighlightWithUtterances } from '@/lib/db/highlights';
import { getSubjectsForMeeting, SubjectWithRelations } from '@/lib/db/subject';
import { getStatisticsFor, Statistics } from '@/lib/statistics';
import { SpeakerTag, TaskStatus } from '@prisma/client';
import { Party } from '@prisma/client';

export type MeetingData = {
    meeting: CouncilMeetingWithAdminBody;
    transcript: Transcript;
    city: CityWithGeometry;
    people: PersonWithRelations[];
    parties: Party[];
    highlights: HighlightWithUtterances[];
    subjects: (SubjectWithRelations & { statistics?: Statistics })[];
    speakerTags: SpeakerTag[];
}

export const getMeetingData = async (cityId: string, meetingId: string): Promise<MeetingData> => {
    console.log('getting meeting data for', cityId, meetingId);
    const [meeting, transcript, city, people, parties, highlights, subjects] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getTranscript(meetingId, cityId),
        getCity(cityId),
        getPeopleForCity(cityId),
        getPartiesForCity(cityId),
        getHighlightsForMeeting(cityId, meetingId),
        getSubjectsForMeeting(cityId, meetingId)
    ]);

    if (!meeting || !city || !transcript || !subjects) {
        throw new Error('Required data not found');
    }

    const subjectsWithStatistics = await Promise.all(subjects.map(async (subject) => ({
        ...subject,
        statistics: await getStatisticsFor({ subjectId: subject.id }, ["person", "party"])
    })));

    const cityWithGeometry = await getCitiesWithGeometry([city]);

    const speakerTags: SpeakerTag[] = Array.from(new Set(transcript.map((segment) => segment.speakerTag.id)))
        .map(id => transcript.find(s => s.speakerTag.id === id)?.speakerTag)
        .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);

    return { meeting, transcript, city: cityWithGeometry[0], people, parties, highlights, subjects: subjectsWithStatistics, speakerTags };
}

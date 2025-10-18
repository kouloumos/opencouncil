"use server";
import { TranscribeResult, Voiceprint } from "../apiTypes";
import prisma from "../db/prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getPeopleForCity } from "@/lib/db/people";
import { 
  requestTranscribeTranscript, 
  handleTranscribeResultGeneric 
} from './transcribeGeneric';

export async function requestTranscribe(youtubeUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    // ADAPTER: Council-specific transcription request
    await withUserAuthorizedToEdit({ cityId });

    console.log(`Requesting transcription for ${youtubeUrl}`);
    
    // Get council-specific context (city info, people, parties)
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        include: {
            persons: true,
            parties: true
        }
    });
    
    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: councilMeetingId } }
    });
    
    if (!city || !councilMeeting) {
        throw new Error("Council meeting or city not found");
    }

    // Council-specific vocabulary and prompt
    const vocabulary = [city.name, ...city.persons.map(p => p.name), ...city.parties.map(p => p.name)].flatMap(s => s.split(' '));
    const prompt = `Αυτή είναι η απομαγνητοφώνηση της συνεδρίασης του δήμου της ${city.name} που έγινε στις ${councilMeeting.dateTime}.`;

    // Council-specific voiceprints (from Person -> Speaker)
    const people = await getPeopleForCity(cityId);
    const voiceprints: Voiceprint[] = people
        .filter(person => person.voicePrints && person.voicePrints.length > 0)
        .map(person => ({
            personId: person.id,
            voiceprint: person.voicePrints![0].embedding
        }));

    console.log(`Found ${voiceprints.length} voiceprints for people in the city`);

    // Call generic transcription request
    return requestTranscribeTranscript(cityId, councilMeetingId, {
        youtubeUrl,
        customVocabulary: vocabulary,
        customPrompt: prompt,
        voiceprints: voiceprints.length > 0 ? voiceprints : undefined,
        force
    });
}

export async function handleTranscribeResult(taskId: string, response: TranscribeResult, options?: { force?: boolean }) {
    // ADAPTER: Council-specific wrapper that calls generic handler
    // The generic handler already handles all the transcript/speaker logic
    return handleTranscribeResultGeneric(taskId, response, options);
}

/**
 * Deletion of a person's voice data: the voiceprint rows and the audio clips
 * that the task server cut for them.
 *
 * One model serves every caller: list the clip folders in the bucket, keep
 * the clips of people with a consent in force, and delete the rest with the
 * rows of the people without one. A person who no longer exists has no
 * consent, so a person delete and a city delete use the same model. The
 * withdrawals, the claim and the deletes call deleteVoiceDataWithoutConsent;
 * the cleanup script calls planVoiceDataDeletion and runVoiceDataDeletion.
 *
 * Not a "use server" file: its callers have no session to gate on. The
 * admin's Delete button goes through deleteVoicePrint in voiceprints.ts,
 * which authorizes first.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { env } from "@/env.mjs";
import { deleteFile, isStorageConfigured, listObjectKeys } from "@/lib/s3";
import { spacesObjectFromUrl, type SpacesObject } from "@/lib/utils/spacesUrl";
import { getConsentedPersonIds, voicePrintsWithoutConsentWhere } from "@/lib/db/voicePrintConsentRule";
import { errorMessage } from "@/lib/utils/errors";
import { sendErrorAdminAlert } from "@/lib/discord-core";

/**
 * Where the task server puts every clip: `voiceprints/{cityId}/{personId}/{random}_v1.mp3`
 * (opencouncil-tasks, generateVoiceprint.ts). The cityId is the city of the
 * meeting that the clip was cut from.
 */
const CLIP_ROOT = "voiceprints/";
const KEY_PART = /^[A-Za-z0-9_-]+$/;

/**
 * `voiceprints/{cityId}/` or `voiceprints/{cityId}/{personId}/`. The parts
 * are checked: an empty or a `/` part would widen the folder to other people.
 * The trailing `/` keeps person `p1` from matching `p10`.
 */
export function voiceprintClipFolder(cityId: string, personId?: string): string {
    for (const part of personId === undefined ? [cityId] : [cityId, personId]) {
        if (!KEY_PART.test(part)) throw new Error(`Not a part of a voiceprint clip key: "${part}"`);
    }
    return `${CLIP_ROOT}${cityId}/${personId === undefined ? "" : `${personId}/`}`;
}

/** The person that a key in the clip folder belongs to, or null for a key of another shape. */
function clipOwner(key: string): string | null {
    const [root, cityId, personId, file] = key.split("/");
    if (`${root}/` !== CLIP_ROOT || !file || !KEY_PART.test(cityId ?? "") || !KEY_PART.test(personId ?? "")) return null;
    return personId;
}

/**
 * Clips are deleted only on production. Elsewhere the bucket setting can
 * name the production bucket (the previews, a developer's .env), and the
 * people carry production ids (the seed artifact), so a test withdrawal
 * would delete a production clip. The rows are deleted everywhere.
 */
const deletesClips = () => env.DEPLOYMENT_ENV === "production";

export type ClipFailure = { item: string; error: string };

const unique = <T,>(values: T[]) => [...new Set(values)];

const objectOf = (url: string) => spacesObjectFromUrl(url, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL });

async function deleteObject({ bucket, key }: SpacesObject): Promise<ClipFailure | null> {
    try {
        await deleteFile(bucket, key);
        return null;
    } catch (error) {
        return { item: `${bucket}/${key}`, error: errorMessage(error) };
    }
}

/** The clips whose owner has no consent in force; a person who no longer exists has none. */
async function clipsWithoutConsent(clips: SpacesObject[]): Promise<SpacesObject[]> {
    const consented = await getConsentedPersonIds(unique(clips.flatMap(({ key }) => clipOwner(key) ?? [])));
    return clips.filter(({ key }) => {
        const owner = clipOwner(key);
        return owner !== null && !consented.has(owner);
    });
}

const planRowSelect = {
    id: true,
    sourceAudioUrl: true,
    person: { select: { name: true, cityId: true } },
} satisfies Prisma.VoicePrintSelect;

export type VoiceDataPlan = {
    /** The rows of people without a consent in force. */
    voicePrints: Prisma.VoicePrintGetPayload<{ select: typeof planRowSelect }>[];
    /** The clips in the folders of people without a consent in force. */
    clips: SpacesObject[];
    /** False without storage keys: the clips were not listed. */
    listed: boolean;
    /** Buckets that could not be listed: their clips are not in `clips`. */
    listFailures: ClipFailure[];
};

/**
 * What a deletion removes, for one person, one city, or every person: the
 * rows of the people without a consent in force, and every clip in their
 * folders. The folders are found by listing the bucket, so a clip that no
 * row names is found too. Reads only.
 */
export async function planVoiceDataDeletion(scope: { personId?: string; cityId?: string } = {}): Promise<VoiceDataPlan> {
    for (const part of [scope.personId, scope.cityId]) {
        if (part !== undefined && !KEY_PART.test(part)) throw new Error(`Not an id: "${part}"`);
    }
    const voicePrints = await prisma.voicePrint.findMany({
        where: {
            AND: [
                voicePrintsWithoutConsentWhere,
                ...(scope.personId === undefined ? [] : [{ personId: scope.personId }]),
                ...(scope.cityId === undefined ? [] : [{ person: { cityId: scope.cityId } }]),
            ],
        },
        select: planRowSelect,
        orderBy: [{ person: { cityId: "asc" } }, { createdAt: "asc" }],
    });
    if (!isStorageConfigured()) return { voicePrints, clips: [], listed: false, listFailures: [] };

    // A person's clips sit in the folder of the meeting's city, which can be
    // another city than the person's, so one person's clips are looked for in
    // the whole clip folder.
    const prefix = scope.cityId === undefined ? CLIP_ROOT : voiceprintClipFolder(scope.cityId);
    const urls = await prisma.voicePrint.findMany({ select: { sourceAudioUrl: true } });
    const buckets = unique([env.DO_SPACES_BUCKET, ...urls.flatMap((row) => objectOf(row.sourceAudioUrl)?.bucket ?? [])]);

    const listedClips: SpacesObject[] = [];
    const listFailures: ClipFailure[] = [];
    for (const bucket of buckets) {
        try {
            for (const key of await listObjectKeys(bucket, prefix)) {
                const owner = clipOwner(key);
                if (owner !== null && (scope.personId === undefined || owner === scope.personId)) listedClips.push({ bucket, key });
            }
        } catch (error) {
            listFailures.push({ item: `${bucket}/${prefix}`, error: errorMessage(error) });
        }
    }
    return { voicePrints, clips: await clipsWithoutConsent(listedClips), listed: true, listFailures };
}

/**
 * Delete what planVoiceDataDeletion found: the rows first, so the transcribe
 * request cannot send them whatever happens to the clips after, then the
 * clips. Both are checked against the consent again, so a consent given
 * since the plan keeps its voiceprint and its clips. A failed row delete
 * throws and keeps every clip.
 */
export async function runVoiceDataDeletion(plan: VoiceDataPlan): Promise<ClipFailure[]> {
    if (plan.voicePrints.length > 0) {
        await prisma.voicePrint.deleteMany({
            where: { AND: [{ id: { in: plan.voicePrints.map((row) => row.id) } }, voicePrintsWithoutConsentWhere] },
        });
    }
    if (plan.clips.length === 0) return [];
    if (!deletesClips()) {
        console.warn(`Not on production: ${plan.clips.length} voiceprint clip(s) left in place`);
        return [];
    }
    const failures: ClipFailure[] = [];
    for (const clip of await clipsWithoutConsent(plan.clips)) {
        const failure = await deleteObject(clip);
        if (failure) failures.push(failure);
    }
    return failures;
}

async function reportFailures(failures: ClipFailure[], context: string): Promise<void> {
    if (failures.length === 0) return;
    console.error(`Voice data not fully deleted (${context}):`, failures);
    await sendErrorAdminAlert({
        source: "Voiceprint deletion",
        error: `${failures.length} item(s) not deleted. The dry run of npm run voiceprints:delete-without-consent lists what is left.`,
        context: { context, first: `${failures[0].item}: ${failures[0].error}` },
    });
}

/**
 * Delete the voice data of the people in `scope` who have no consent in
 * force: after a withdrawal, after a claim that closed a consent, after a
 * refused voiceprint result, and after a person or a city delete. Call it
 * after the change has committed: it reads with the global client, so
 * inside the change's transaction it would still see the open period.
 *
 * Never throws: the change that caused it must stand. A failure is logged
 * and alerted, and the cleanup script removes what is left.
 */
export async function deleteVoiceDataWithoutConsent(scope: { personId: string } | { cityId: string }, context: string): Promise<ClipFailure[]> {
    let failures: ClipFailure[];
    try {
        const plan = await planVoiceDataDeletion(scope);
        failures = [...plan.listFailures, ...await runVoiceDataDeletion(plan)];
    } catch (error) {
        failures = [{ item: `voice data (${context})`, error: errorMessage(error) }];
    }
    await reportFailures(failures, context);
    return failures;
}

/**
 * The admin's Delete button: one voiceprint, whatever the consent, with the
 * clip that it names. A failed row delete throws, so the admin sees that the
 * voiceprint is still there.
 */
export async function deleteVoicePrintById(voicePrintId: string): Promise<void> {
    const row = await prisma.voicePrint.findUnique({ where: { id: voicePrintId }, select: { sourceAudioUrl: true } });
    if (!row) return;
    await prisma.voicePrint.deleteMany({ where: { id: voicePrintId } });
    if (!deletesClips() || !isStorageConfigured()) return;
    const object = objectOf(row.sourceAudioUrl);
    if (!object || !object.key.startsWith(CLIP_ROOT)) return;
    const failure = await deleteObject(object);
    if (failure) await reportFailures([failure], `voiceprint ${voicePrintId} deleted`);
}

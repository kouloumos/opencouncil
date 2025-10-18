"use server";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { VoicePrint } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function createVoicePrint(
    voiceprint: Omit<VoicePrint, "id" | "createdAt" | "updatedAt">,
): Promise<string | null> {
    try {
        const person = await prisma.person.findUnique({
            where: { id: voiceprint.speakerId },
        });

        if (!person) {
            throw new Error("Person not found");
        }

        try {
            const voicePrint = await prisma.voicePrint.create({
                data: {
                    embedding: voiceprint.embedding,
                    speakerId: voiceprint.speakerId,
                    sourceSegmentId: voiceprint.sourceSegmentId,
                    sourceAudioUrl: voiceprint.sourceAudioUrl,
                    startTimestamp: voiceprint.startTimestamp,
                    endTimestamp: voiceprint.endTimestamp,
                },
            });

            revalidatePath(`/admin/people`, "page");

            console.log(`Created voice print with ID: ${voicePrint.id}`);
            return voicePrint.id;
        } catch (error) {
            console.error("Error creating voice print:", error);
            throw new Error("Failed to create voice print");
        }
    } catch (error) {
        console.error("Error creating voiceprint:", error);
        throw new Error("Failed to create voiceprint");
    }
}

export async function deleteVoicePrint(voicePrintId: string): Promise<void> {
    try {
        // Get voiceprint to verify authorization
        const voicePrint = await prisma.voicePrint.findUnique({
            where: { id: voicePrintId },
            include: {
                speaker: {
                    select: { workspaceId: true },
                },
            },
        });

        if (!voicePrint) {
            throw new Error("Voice print not found");
        }

        await withUserAuthorizedToEdit({ cityId: voicePrint.speaker.workspaceId });

        await prisma.voicePrint.delete({
            where: { id: voicePrintId },
        });
        revalidatePath(`/admin/people`, "page");
    } catch (error) {
        console.error("Error deleting voice print:", error);
        throw new Error("Failed to delete voice print");
    }
}

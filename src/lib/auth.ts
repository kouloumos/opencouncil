"use server";
import { type City, type Party, type Person, type CouncilMeeting, type User } from "@prisma/client";
import { auth } from "@/auth";
import prisma from "@/lib/db/prisma";
import { type UserWithAdministers } from "@/lib/db/users";
import { userWithAdministersInclude } from "@/lib/db/includes";

export async function getCurrentUser(): Promise<UserWithAdministers | null> {
    const session = await auth();
    if (!session?.user?.email) return null;

    return prisma.user.findUnique({
        where: { email: session.user.email },
        include: userWithAdministersInclude
    });
}

async function checkUserAuthorization({
    cityId,
    partyId,
    personId,
    councilMeetingId,
    workspaceId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"],
    workspaceId?: string
}) {
    // Count defined parameters, but allow cityId + councilMeetingId combination
    const definedParams = [partyId, personId].filter(Boolean);
    const hasCityId = Boolean(cityId);
    const hasCouncilMeetingId = Boolean(councilMeetingId);
    const hasWorkspaceId = Boolean(workspaceId);
    
    // Validate parameter combinations
    if (definedParams.length > 1) {
        throw new Error("Only one of partyId or personId should be defined");
    }
    
    if (definedParams.length > 0 && (hasCityId || hasCouncilMeetingId || hasWorkspaceId)) {
        throw new Error("cityId/councilMeetingId/workspaceId cannot be combined with partyId or personId");
    }

    if (hasCouncilMeetingId && !hasCityId) {
        throw new Error("cityId is required when councilMeetingId is provided");
    }

    const user = await getCurrentUser();
    if (!user) return false;

    // Superadmins can edit everything
    if (user.isSuperAdmin) return true;

    if (!cityId && !partyId && !personId && !councilMeetingId && !workspaceId) {
        return false; // Only superadmins can edit anything
    }

    // If both cityId and councilMeetingId are provided, validate they match
    if (cityId && councilMeetingId) {
        const councilMeeting = await prisma.councilMeeting.findUnique({
            where: {
                cityId_id: {
                    cityId: cityId,
                    id: councilMeetingId
                }
            },
            select: { cityId: true }
        });

        if (!councilMeeting) {
            throw new Error("Council meeting not found or does not belong to the specified city");
        }
    }

    // Check direct administration rights
    const hasDirectAccess = user.administers.some(a =>
        (cityId && a.cityId === cityId) ||
        (workspaceId && a.workspaceId === workspaceId) ||
        (partyId && a.partyId === partyId) ||
        (personId && a.personId === personId)
    );

    if (hasDirectAccess) return true;

    // Check hierarchical rights
    if (partyId || personId) {
        // Get the city for the entity
        const entity = partyId ? await prisma.party.findUnique({ where: { id: partyId }, select: { cityId: true } })
            : personId ? await prisma.person.findUnique({ where: { id: personId }, select: { cityId: true } })
                : null;

        if (entity?.cityId) {
            // If user administers the city, they can edit everything in it
            // Check both workspaceId (new) and cityId (old) for backward compatibility
            const hasAccess = user.administers.some(a => a.workspaceId === entity.cityId || a.cityId === entity.cityId);
            if (hasAccess) return true;
        }
    }

    return false;
}

export async function withUserAuthorizedToEdit({
    cityId,
    partyId,
    personId,
    councilMeetingId,
    workspaceId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"],
    workspaceId?: string
}) {
    const isAuthorized = await checkUserAuthorization({
        cityId,
        partyId,
        personId,
        councilMeetingId,
        workspaceId
    });

    if (!isAuthorized) {
        throw new Error("Not authorized");
    }

    return true;
}

export async function isUserAuthorizedToEdit({
    cityId,
    partyId,
    personId,
    councilMeetingId,
    workspaceId
}: {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"],
    workspaceId?: string
}) {
    return checkUserAuthorization({
        cityId,
        partyId,
        personId,
        councilMeetingId,
        workspaceId
    });
}

export async function getOrCreateUserFromRequest(
    email?: string | null,
    name?: string | null,
    phone?: string | null
) {
    let user: User | null = await getCurrentUser()

    if (!user) {
        if (!email) {
            return null
        }
        user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: {
                email,
                name,
                phone,
                allowContact: true,
                onboarded: true,
            },
        })
    } else if (phone) {
        // If phone is provided, update the user's phone
        user = await prisma.user.update({
            where: { id: user.id },
            data: { phone },
        })
    }

    return user
}
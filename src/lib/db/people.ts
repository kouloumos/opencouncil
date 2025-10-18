"use server";
import { Person, Role, VoicePrint } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { getActiveRoleCondition } from "../utils";
import { RoleWithRelations, roleWithRelationsInclude } from "./types";
import { updateSpeaker } from "./speakers";

export type PersonWithRelations = Person & {
    roles: RoleWithRelations[];
    voicePrints?: VoicePrint[];
    image: string | null;
};

export async function deletePerson(id: string): Promise<void> {
    await withUserAuthorizedToEdit({ personId: id });
    try {
        await prisma.person.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting person:', error);
        throw new Error('Failed to delete person');
    }
}

export async function createPerson(data: {
    cityId: string;
    name: string;
    name_en: string;
    name_short: string;
    name_short_en: string;
    image: string | null;
    profileUrl: string | null;
    roles: Role[];
}): Promise<Person> {
    await withUserAuthorizedToEdit({ cityId: data.cityId });
    try {
        // ADAPTER: Create both Speaker (generic) and Person (council-specific)
        // Create in transaction: Speaker first, then Person (with same ID)
        const newPerson = await prisma.$transaction(async (tx) => {
            // Create Speaker (generic layer) - Prisma will auto-generate ID
            const speaker = await tx.speaker.create({
                data: {
                    workspaceId: data.cityId,
                    name: data.name,
                    image: data.image,
                }
            });
            
            // Create Person (council-specific) with same ID as Speaker
            return await tx.person.create({
                data: {
                    id: speaker.id, // Use the same ID as the Speaker
                    cityId: data.cityId,
                    name: data.name,
                    name_en: data.name_en,
                    name_short: data.name_short,
                    name_short_en: data.name_short_en,
                    profileUrl: data.profileUrl,
                    roles: {
                        create: data.roles.map(role => ({
                            cityId: role.cityId,
                            partyId: role.partyId,
                            administrativeBodyId: role.administrativeBodyId,
                            name: role.name,
                            name_en: role.name_en,
                            isHead: role.isHead,
                            startDate: role.startDate,
                            endDate: role.endDate,
                            rank: role.rank
                        }))
                    }
                },
                include: {
                    roles: roleWithRelationsInclude
                }
            });
        });
        
        return newPerson;
    } catch (error) {
        console.error('Error creating person:', error);
        throw new Error('Failed to create person');
    }
}

export async function editPerson(id: string, data: {
    name: string;
    name_en: string;
    name_short: string;
    name_short_en: string;
    image?: string;
    profileUrl: string | null;
    roles: Role[];
}): Promise<Person> {
    await withUserAuthorizedToEdit({ personId: id });
    try {
        // ADAPTER: Update both Speaker (generic) and Person (council-specific)
        const updatedPerson = await prisma.$transaction(async (tx) => {
            // First delete all existing roles
            await tx.role.deleteMany({
                where: { personId: id }
            });

            // Update Speaker (generic layer) using the generic method
            await updateSpeaker(
                id,
                {
                    name: data.name,
                    image: data.image
                },
                tx
            );

            // Then update the person and create new roles
            return await tx.person.update({
                where: { id },
                data: {
                    name: data.name,
                    name_en: data.name_en,
                    name_short: data.name_short,
                    name_short_en: data.name_short_en,
                    profileUrl: data.profileUrl,
                    roles: {
                        create: data.roles.map(role => ({
                            cityId: role.cityId,
                            partyId: role.partyId,
                            administrativeBodyId: role.administrativeBodyId,
                            name: role.name,
                            name_en: role.name_en,
                            isHead: role.isHead,
                            startDate: role.startDate,
                            endDate: role.endDate,
                            rank: role.rank
                        }))
                    }
                },
                include: {
                    roles: roleWithRelationsInclude
                }
            });
        });
        return updatedPerson;
    } catch (error) {
        console.error('Error editing person:', error);
        throw new Error('Failed to edit person');
    }
}

export async function getPerson(id: string): Promise<PersonWithRelations | null> {
    try {
        // ADAPTER: Fetch Person with Speaker relation (generic layer)
        const person = await prisma.person.findUnique({
            where: { id },
            include: {
                roles: roleWithRelationsInclude,
                speaker: {
                    include: {
                        voicePrints: {
                            orderBy: {
                                createdAt: 'desc'
                            },
                            take: 1 // Only get the most recent voiceprint
                        }
                    }
                }
            }
        });
        
        // Flatten voicePrints and image for backward compatibility (from generic Speaker)
        if (person) {
            return {
                ...person,
                voicePrints: person.speaker?.voicePrints,
                image: person.speaker?.image ?? null
            };
        }
        return person;
    } catch (error) {
        console.error('Error fetching person:', error);
        throw new Error('Failed to fetch person');
    }
}

export async function getPeopleForCity(cityId: string, activeRolesOnly: boolean = false): Promise<PersonWithRelations[]> {
    try {
        // ADAPTER: Fetch People with Speaker relation (generic layer)
        const now = new Date();
        const people = await prisma.person.findMany({
            where: { cityId },
            include: {
                roles: {
                    where: activeRolesOnly ? {
                        OR: getActiveRoleCondition(now)
                    } : undefined,
                    ...roleWithRelationsInclude
                },
                speaker: {
                    include: {
                        voicePrints: {
                            orderBy: {
                                createdAt: 'desc'
                            },
                            take: 1 // Only get the most recent voiceprint
                        }
                    }
                }
            }
        });
        
        // Flatten voicePrints and image for backward compatibility (from generic Speaker)
        const peopleWithVoiceprints = people.map(person => ({
            ...person,
            voicePrints: person.speaker?.voicePrints,
            image: person.speaker?.image ?? null
        }));
        
        return peopleWithVoiceprints.sort(() => Math.random() - 0.5);
    } catch (error) {
        console.error('Error fetching people for city:', error);
        throw new Error('Failed to fetch people for city');
    }
} 

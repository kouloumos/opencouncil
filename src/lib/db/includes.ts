import { Prisma } from "@prisma/client";

/**
 * Shared Prisma include configurations
 * This file contains reusable include objects for consistent database queries
 */

export const userWithAdministersInclude = {
    administers: {
        include: {
            workspace: {
                include: {
                    city: true
                }
            },
            party: {
                include: {
                    city: true
                }
            },
            person: {
                include: {
                    city: true
                }
            }
        }
    }
} satisfies Prisma.UserInclude;


import 'server-only';

import { subDays } from 'date-fns';
import prisma from './prisma';
import { peopleOnly } from '@/lib/db/types';

export interface UserGrowth {
    total: number;
    newLast7Days: number;
    newPrev7Days: number;
    percentChange: number;
}

export function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

/** The accounts of people, and how many signed up this week against the week before. */
export async function getUserGrowth(now: Date = new Date()): Promise<UserGrowth> {
    const sevenDaysAgo = subDays(now, 7);
    const fourteenDaysAgo = subDays(now, 14);
    const [total, newLast7Days, newPrev7Days] = await Promise.all([
        prisma.user.count({ where: peopleOnly }),
        prisma.user.count({ where: { ...peopleOnly, createdAt: { gte: sevenDaysAgo } } }),
        prisma.user.count({ where: { ...peopleOnly, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
    ]);
    return { total, newLast7Days, newPrev7Days, percentChange: percentChange(newLast7Days, newPrev7Days) };
}

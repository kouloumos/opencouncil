/**
 * Export the agenda subjects of a city, with the agenda document of their meeting.
 * Step 1 of the one-time backfill for #616.
 *
 * Pipeline:
 *   1. this script                                          -> <city>-agenda-subjects.json
 *   2. opencouncil-tasks/scripts/align-agenda-titles.ts     -> <city>-agenda-titles.json
 *   3. scripts/build-agenda-title-review.ts                 -> <city>-agenda-title-review.html
 *   4. scripts/import-agenda-titles.ts                      (writes Subject.agendaItemTitle)
 *
 * Read-only. It does not select agendaItemTitle, so it also runs against a database
 * that does not have the column yet; the import script skips subjects already titled.
 *
 * Usage:
 *   npx tsx scripts/export-agenda-subjects.ts --city zografou [--out <file>]
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const cityId = arg("--city");
    if (!cityId) {
        console.error("Usage: npx tsx scripts/export-agenda-subjects.ts --city <cityId> [--out <file>]");
        process.exit(1);
    }
    const out = arg("--out") ?? `${cityId}-agenda-subjects.json`;

    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true } });
    if (!city) throw new Error(`Unknown city ${cityId}`);

    const meetings = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            agendaUrl: { not: null },
            subjects: { some: { agendaItemIndex: { not: null } } },
        },
        orderBy: { dateTime: "desc" },
        select: {
            id: true,
            dateTime: true,
            agendaUrl: true,
            administrativeBody: { select: { name: true } },
            subjects: {
                where: { agendaItemIndex: { not: null } },
                orderBy: { agendaItemIndex: "asc" },
                select: { id: true, agendaItemIndex: true, name: true, description: true },
            },
        },
    });

    const payload = {
        cityId,
        cityName: city.name,
        exportedAt: new Date().toISOString(),
        meetings: meetings.map(m => ({
            meetingId: m.id,
            dateTime: m.dateTime.toISOString(),
            administrativeBodyName: m.administrativeBody?.name ?? null,
            agendaUrl: m.agendaUrl as string,
            subjects: m.subjects.map(s => ({
                id: s.id,
                agendaItemIndex: s.agendaItemIndex as number,
                name: s.name,
                description: s.description,
            })),
        })),
    };
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    const subjectCount = payload.meetings.reduce((n, m) => n + m.subjects.length, 0);
    console.log(`${cityId}: ${payload.meetings.length} meetings with an agenda, ${subjectCount} agenda subjects -> ${out}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

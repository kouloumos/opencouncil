/**
 * Export what an offline decision-matching A/B needs for a few meetings: the meeting,
 * its body's Diavgeia scope, its agenda subjects with their current decision link, and
 * the city's decision candidates published inside a window after the meeting.
 * Read-only. One-off for the #616 matching experiment.
 *
 * Usage: npx tsx scripts/export-poll-ab.ts --city athens --meetings a,b,c [--window-days 60] --out file.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const cityId = arg("--city") ?? "athens";
    const meetingIds = (arg("--meetings") ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const windowDays = parseInt(arg("--window-days") ?? "60", 10);
    const out = arg("--out");
    if (meetingIds.length === 0 || !out) {
        console.error("Usage: npx tsx scripts/export-poll-ab.ts --city <id> --meetings a,b,c [--window-days N] --out <file>");
        process.exit(1);
    }
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true, diavgeiaUid: true, timezone: true } });
    if (!city) throw new Error(`Unknown city ${cityId}`);

    const meetings = [];
    for (const id of meetingIds) {
        const m = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
            select: {
                id: true, dateTime: true, agendaUrl: true,
                administrativeBody: { select: { id: true, name: true, diavgeiaUnitIds: true } },
                subjects: {
                    where: { agendaItemIndex: { not: null } },
                    orderBy: { agendaItemIndex: "asc" },
                    select: { id: true, agendaItemIndex: true, name: true, description: true, decision: { select: { ada: true, title: true } } },
                },
            },
        });
        if (!m) throw new Error(`Unknown meeting ${cityId}/${id}`);
        const from = new Date(m.dateTime);
        const to = new Date(from.getTime() + windowDays * 86_400_000);
        const candidates = await prisma.decisionCandidate.findMany({
            where: { cityId, publishDate: { gte: from, lte: to } },
            select: { ada: true, title: true, pdfUrl: true, publishDate: true, meetingDate: true, readStatus: true, councilMeetingId: true, subjectId: true, dismissedAt: true, decisionNumber: true, confidence: true },
        });
        meetings.push({
            meetingId: m.id,
            dateTime: m.dateTime.toISOString(),
            agendaUrl: m.agendaUrl,
            administrativeBodyName: m.administrativeBody?.name ?? null,
            diavgeiaUnitIds: m.administrativeBody?.diavgeiaUnitIds ?? [],
            subjects: m.subjects.map(s => ({ id: s.id, agendaItemIndex: s.agendaItemIndex as number, name: s.name, description: s.description, existingAda: s.decision?.ada ?? null, existingDecisionTitle: s.decision?.title ?? null })),
            candidates: candidates.map(c => ({ ...c, publishDate: c.publishDate?.toISOString() ?? null, meetingDate: c.meetingDate?.toISOString() ?? null, dismissedAt: c.dismissedAt?.toISOString() ?? null })),
        });
        console.log(`${id}: ${m.subjects.length} subjects, ${m.subjects.filter(s => s.decision).length} linked, ${candidates.length} candidates in window`);
    }
    fs.writeFileSync(out, JSON.stringify({ cityId, cityName: city.name, diavgeiaUid: city.diavgeiaUid, timezone: city.timezone, windowDays, meetings }, null, 2));
    console.log(`-> ${out}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

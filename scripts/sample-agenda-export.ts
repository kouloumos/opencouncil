/**
 * Cut an agenda export down to a sample of meetings per administrative body. Lets a large
 * city be aligned in a reviewable first pass; the rest follows with the align script's
 * --resume, which keys on meetingId and so skips whatever this pass already produced.
 *
 * Meetings are spread evenly across each body's history, oldest and newest included, so the
 * sample covers agenda formats that changed over time rather than only the recent ones.
 *
 * With --titles it cuts an align output down to the same sample instead. A titles file
 * carries no administrative body, so the export supplies the mapping. The import skips
 * subjects that already carry a title, so writing a sample first and the whole city later
 * writes each subject once.
 *
 * Usage:
 *   npx tsx scripts/sample-agenda-export.ts <export.json> --per-body 5 -O <sample.json>
 *   npx tsx scripts/sample-agenda-export.ts <export.json> --per-body 2 --titles <titles.json> -O <sample-titles.json>
 */
import fs from "fs";

const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
};

function spread<T>(items: T[], want: number): T[] {
    if (items.length <= want) return items;
    if (want === 1) return [items[0]];
    const picked = new Set<number>();
    for (let i = 0; i < want; i++) picked.add(Math.round((i * (items.length - 1)) / (want - 1)));
    return [...picked].sort((a, b) => a - b).map(i => items[i]);
}

const inputFile = process.argv[2];
const outFile = arg("-O");
const perBody = parseInt(arg("--per-body") ?? "5", 10);
if (!inputFile || inputFile.startsWith("-") || !outFile) {
    console.error("Usage: npx tsx scripts/sample-agenda-export.ts <export.json> --per-body N -O <sample.json>");
    process.exit(1);
}

const file = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const byBody = new Map<string, any[]>();
for (const m of file.meetings) {
    const body = m.administrativeBodyName ?? "(none)";
    if (!byBody.has(body)) byBody.set(body, []);
    byBody.get(body)!.push(m);
}

const sampled: any[] = [];
for (const [body, meetings] of byBody) {
    const take = spread(meetings, perBody);
    sampled.push(...take);
    console.log(`  ${take.length}/${meetings.length}  ${body}`);
}
sampled.sort((a, b) => file.meetings.indexOf(a) - file.meetings.indexOf(b));

const titlesFile = arg("--titles");
if (titlesFile) {
    const picked = new Set(sampled.map(m => m.meetingId));
    const titles = JSON.parse(fs.readFileSync(titlesFile, "utf8"));
    const kept = titles.meetings.filter((m: any) => picked.has(m.meetingId));
    fs.writeFileSync(outFile, JSON.stringify({ ...titles, meetings: kept }, null, 2));
    const n = kept.reduce((acc: number, m: any) => acc + (m.titles?.length ?? 0), 0);
    console.log(`${titles.cityId}: ${kept.length} of ${titles.meetings.length} aligned meetings, ${n} titles -> ${outFile}`);
} else {
    fs.writeFileSync(outFile, JSON.stringify({ ...file, meetings: sampled }, null, 2));
    const subjects = sampled.reduce((n, m) => n + m.subjects.length, 0);
    console.log(`${file.cityId}: ${sampled.length} of ${file.meetings.length} meetings, ${subjects} subjects -> ${outFile}`);
}

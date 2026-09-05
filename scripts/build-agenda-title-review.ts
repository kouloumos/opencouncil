/**
 * Build a local review page for aligned agenda item titles. Step 3 of the one-time
 * backfill for #616. Reads the export and the titles files; writes one HTML file.
 *
 * Overlap = share of the title's distinctive tokens (4+ letters, not a stop word) that
 * appear in the subject's name plus description. Rows with a low overlap, a missing
 * title, a leading number, or a rapporteur marker are flagged for the reviewer.
 *
 * Usage:
 *   npx tsx scripts/build-agenda-title-review.ts <export.json> <titles.json> -O <review.html>
 */
import fs from "fs";

interface ExportSubject { id: string; agendaItemIndex: number; name: string; description: string }
interface ExportMeeting { meetingId: string; dateTime: string; administrativeBodyName: string | null; agendaUrl: string; subjects: ExportSubject[] }
interface ExportFile { cityId: string; cityName: string; meetings: ExportMeeting[] }
interface AlignedTitle { subjectId: string; agendaItemTitle: string | null; note?: string }
interface AlignedMeeting { meetingId: string; titles: AlignedTitle[]; error?: string }
interface TitlesFile { cityId: string; meetings: AlignedMeeting[] }

// Accent-free, lowercase: tokens() strips accents before the lookup.
const STOP = new Set(["και", "του", "της", "των", "για", "απο", "στην", "στον", "στη", "στο", "στις", "στους",
    "περι", "εγκριση", "θεμα", "δημου", "δημος", "ληψη", "αποφασης", "σχετικα", "προς", "επι", "κατα", "μετα", "υπο"]);

function tokens(text: string): Set<string> {
    const plain = text.toLocaleLowerCase("el").normalize("NFD").replace(/[̀-ͯ]/g, "");
    return new Set(plain.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 4 && !STOP.has(t)));
}

function overlap(title: string, name: string, description: string): number {
    const wanted = tokens(title);
    if (wanted.size === 0) return 0;
    const have = tokens(`${name} ${description}`);
    let hit = 0;
    for (const t of wanted) if (have.has(t)) hit++;
    return hit / wanted.size;
}

function flags(title: string | null, score: number, note?: string): string[] {
    if (title === null) return [note ?? "no title"];
    const out: string[] = [];
    if (score < 0.2) out.push(`overlap ${score.toFixed(2)}`);
    if (/^\d/.test(title)) out.push("starts with a number");
    if (/ΕΙΣΗΓΗΤ|\{/.test(title)) out.push("rapporteur marker");
    return out;
}

function esc(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
    const [exportPath, titlesPath] = [process.argv[2], process.argv[3]];
    const out = arg("-O");
    if (!exportPath || !titlesPath || !out) {
        console.error("Usage: npx tsx scripts/build-agenda-title-review.ts <export.json> <titles.json> -O <review.html>");
        process.exit(1);
    }
    const exported = JSON.parse(fs.readFileSync(exportPath, "utf8")) as ExportFile;
    const titles = JSON.parse(fs.readFileSync(titlesPath, "utf8")) as TitlesFile;
    const alignedByMeeting = new Map(titles.meetings.map(m => [m.meetingId, m]));

    const sections: string[] = [];
    const summary: string[] = [];
    let totalSubjects = 0, totalTitled = 0, totalFlagged = 0;

    for (const meeting of exported.meetings) {
        const aligned = alignedByMeeting.get(meeting.meetingId);
        if (!aligned) continue;
        const titleById = new Map(aligned.titles.map(t => [t.subjectId, t]));
        const rows: string[] = [];
        let titled = 0, flagged = 0;
        for (const s of meeting.subjects) {
            const t = titleById.get(s.id);
            const title = t?.agendaItemTitle ?? null;
            const score = title ? overlap(title, s.name, s.description) : 0;
            const f = flags(title, score, t?.note);
            if (title) titled++;
            if (f.length) flagged++;
            rows.push(`<tr class="${f.length ? "flag" : ""}"><td>${s.agendaItemIndex}</td><td>${esc(s.name)}</td><td class="desc">${esc(s.description.slice(0, 160))}</td><td>${title ? esc(title) : "<em>null</em>"}</td><td>${title ? score.toFixed(2) : ""}</td><td>${esc(f.join("; "))}</td><td class="id">${s.id}</td></tr>`);
        }
        totalSubjects += meeting.subjects.length; totalTitled += titled; totalFlagged += flagged;
        const head = `${meeting.meetingId} · ${meeting.dateTime.slice(0, 10)}${meeting.administrativeBodyName ? " · " + esc(meeting.administrativeBodyName) : ""}`;
        summary.push(`<tr><td><a href="#${meeting.meetingId}">${esc(meeting.meetingId)}</a></td><td>${meeting.dateTime.slice(0, 10)}</td><td>${meeting.subjects.length}</td><td>${titled}</td><td>${flagged}</td><td>${aligned.error ? esc(aligned.error) : ""}</td></tr>`);
        sections.push(`<h2 id="${meeting.meetingId}">${head} <a class="pdf" href="${esc(meeting.agendaUrl)}">agenda</a></h2>
${aligned.error ? `<p class="error">align error: ${esc(aligned.error)}</p>` : ""}
<table><thead><tr><th>#</th><th>name</th><th>description</th><th>agendaItemTitle</th><th>overlap</th><th>flags</th><th>subject id</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>`);
    }

    const html = `<!doctype html><meta charset="utf-8"><title>Agenda titles · ${esc(exported.cityId)}</title>
<style>body{font:14px/1.4 system-ui;margin:24px;max-width:1400px}table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border:1px solid #ddd;padding:4px 6px;vertical-align:top;text-align:left}th{background:#f4f4f4}tr.flag{background:#fff3cd}.desc{color:#555;max-width:320px}.id{font-family:monospace;font-size:11px;color:#888}.error{color:#b00}.pdf{font-size:12px;margin-left:8px}</style>
<h1>Agenda item titles · ${esc(exported.cityName)} (${esc(exported.cityId)})</h1>
<p>${exported.meetings.length} meetings exported · ${totalSubjects} subjects · ${totalTitled} titled · ${totalFlagged} flagged. Flagged rows are highlighted. Pass rejected meeting ids to <code>--skip-meetings</code> and rejected subject ids to <code>--skip-subjects</code> of the import script.</p>
<table><thead><tr><th>meeting</th><th>date</th><th>subjects</th><th>titled</th><th>flagged</th><th>error</th></tr></thead><tbody>${summary.join("\n")}</tbody></table>
${sections.join("\n")}`;
    fs.writeFileSync(out, html);
    console.log(`${totalSubjects} subjects, ${totalTitled} titled, ${totalFlagged} flagged -> ${out}`);
}

main();

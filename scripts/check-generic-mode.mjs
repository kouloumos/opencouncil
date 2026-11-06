#!/usr/bin/env node
// Check a running app in generic mode (OpenTranscripts) for the OpenCouncil
// product: its pages, API routes and files must answer 404, the OpenTranscripts
// pages must answer, and no page that answers may name OpenCouncil.
//
//   node scripts/check-generic-mode.mjs BASE_URL [ROLE=COOKIE ...] [--ignore=REGEX ...]
//
// BASE_URL  the app, for example http://localhost:3000.
// ROLE=COOKIE  a session to check the signed-in pages with, for example
//   member='authjs.session-token=…' superadmin='authjs.session-token=…'.
//   A member must belong to at least one workspace. A role named superadmin
//   also checks the admin pages. Without sessions, only the public pages run.
// --ignore=REGEX  a match the check must not count, for data that names
//   OpenCouncil, such as a workspace a user called so. Each match is tested
//   with 60 characters before it and 40 after.
//
// The text check reads the HTML without its <script> and <style> elements:
// what a visitor reads, the <head> and every link. Run it after each upstream
// merge: a new OpenCouncil page must answer 404 until someone allows it in
// src/lib/genericModePaths.ts. Exits 1 on any failure.

const args = process.argv.slice(2);
const ignored = args.filter((arg) => arg.startsWith('--ignore=')).map((arg) => new RegExp(arg.slice('--ignore='.length), 'i'));
const [baseUrl, ...sessionArgs] = args.filter((arg) => !arg.startsWith('--ignore='));
if (!baseUrl) {
    console.error('usage: check-generic-mode.mjs BASE_URL [ROLE=COOKIE ...] [--ignore=REGEX ...]');
    process.exit(2);
}
const sessions = Object.fromEntries(sessionArgs.map((arg) => {
    const at = arg.indexOf('=');
    return [arg.slice(0, at), arg.slice(at + 1)];
}));

const HIDDEN = [
    '/about', '/privacy', '/terms', '/mcp', '/notifications', '/petition', '/search', '/explain',
    '/corrections', '/brochure', '/claim', '/unsubscribe', '/offline', '/docs', '/en/about',
    '/profile/highlights', '/admin/cities', '/admin/meetings', '/admin/tasks', '/admin/machines',
    '/qr/t-shirt', '/llms.txt', '/manifest.webmanifest', '/sw.js',
    '/api', '/api/mcp', '/api/search', '/api/cities', '/api/statistics', '/api/admin/entities',
];
const PUBLIC = ['/', '/sign-in', '/en', '/robots.txt', '/sitemap.xml'];
// Answers for the host only; its JSON names the service, which no user reads.
const STATUS_ONLY = ['/api/health'];
const SIGNED_IN = ['/workspaces', '/profile'];
const SUPERADMIN = ['/admin/workspaces', '/admin/users', '/admin/cache'];
const OPENCOUNCIL = /opencouncil/i;

let failures = 0;
function report(ok, line) {
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${line}`);
    if (!ok) failures += 1;
}

async function get(path, cookie) {
    const response = await fetch(new URL(path, baseUrl), { redirect: 'manual', headers: cookie ? { cookie } : {} });
    return { status: response.status, location: response.headers.get('location'), body: await response.text() };
}

function visible(body) {
    return body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

async function expectPage(path, cookie, label) {
    const { status, location, body } = await get(path, cookie);
    if (status !== 200) {
        report(false, `${label} ${path} answers ${status}${location ? ` -> ${location}` : ''}, not 200`);
        return null;
    }
    const matches = [...visible(body).matchAll(new RegExp(`.{0,60}${OPENCOUNCIL.source}.{0,40}`, 'gi'))]
        .map((match) => match[0].replace(/\s+/g, ' '))
        .filter((context) => !ignored.some((pattern) => pattern.test(context)));
    report(matches.length === 0, `${label} ${path}${matches.map((context) => `\n          names OpenCouncil: …${context}…`).join('')}`);
    return body;
}

console.log(`Hidden in generic mode (404):`);
for (const path of HIDDEN) {
    const { status } = await get(path, sessions.superadmin);
    report(status === 404, `${path} answers ${status}`);
}

console.log(`\nPublic pages (200, no OpenCouncil):`);
for (const path of PUBLIC) await expectPage(path, undefined, 'anonymous');
for (const path of STATUS_ONLY) {
    const { status } = await get(path);
    report(status === 200, `anonymous ${path} answers ${status}`);
}

for (const [role, cookie] of Object.entries(sessions)) {
    console.log(`\nSigned in as ${role} (200, no OpenCouncil):`);
    const list = await expectPage('/workspaces', cookie, role);
    for (const path of SIGNED_IN.slice(1)) await expectPage(path, cookie, role);
    if (role === 'superadmin') {
        for (const path of SUPERADMIN) await expectPage(path, cookie, role);
        continue;
    }
    // The first workspace and its first transcript.
    const workspace = list?.match(/href="(\/workspaces\/[^"/?]+)"/)?.[1];
    if (!workspace) {
        report(false, `${role} sees no workspace on /workspaces`);
        continue;
    }
    const page = await expectPage(workspace, cookie, role);
    const transcript = page?.match(/href="(\/workspaces\/[^"/?]+\/transcripts\/[^"/?]+)"/)?.[1];
    if (transcript) await expectPage(transcript, cookie, role);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);

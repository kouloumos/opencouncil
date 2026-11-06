---
name: opentranscripts-rebase
description: Bring OpenTranscripts (the fork kouloumos/opencouncil, deployed from branch `opentranscripts`) up to date with OpenCouncil main by a rebase — back up, rebase in a worktree, resolve conflicts by the fork rules, run the checks, check generic mode, rehearse the migrations on a copy of production, and deploy only on the user's go. Use when asked to rebase, sync or update OpenTranscripts with OpenCouncil.
---

# opentranscripts-rebase

OpenTranscripts is OpenCouncil in generic mode (`NEXT_PUBLIC_APP_MODE=generic`) plus the fork's own commits. A rebase replays the fork's commits on the newest OpenCouncil main.

Production runs on Vercel and builds only from the branch `opentranscripts` of the fork. The Build Command (Project → Settings → Build and Deployment) is `prisma generate && prisma migrate deploy && next build`: every deploy migrates the database that `DATABASE_URL` and `DIRECT_URL` name in the Vercel settings, and the build stops when a migration fails. The build also validates the settings (`src/env.mjs`), so a new required setting must be in Vercel before the push.

Remotes in this repository: `origin` is schemalabz/opencouncil (upstream), `fork` is kouloumos/opencouncil. Check with `git remote -v`; other clones can name them differently.

## Never without the user's go

- Push to `opentranscripts`. The push deploys at once, and after a rebase it is a force push.
- Write to the production database or the production bucket, or change production settings. The rehearsal below only reads production.
- Change the checkout of the user's normal clone. Work in a worktree.

## The fork rules

Resolve every conflict by these rules. A resolution that breaks one of them breaks OpenTranscripts, often without a failing test.

- **Data layer.** `Workspace`, `Transcript` and `Speaker` are base tables. `City`, `CouncilMeeting` and `Person` extend them, with the same ids. The media columns and `released` live on `Transcript`; `withTranscriptFields()` flattens them for the UI. Triggers from the migration `20261104120000_workspace_inheritance` keep the base rows in step. When upstream code reads or writes `councilMeeting.videoUrl`, `muxPlaybackId`, `audioUrl` or `released`, move the access to `transcript`.
- **Migrations.** The fork has two: `20260101000000_opentranscripts_old_fork_guard` and `20261104120000_workspace_inheritance`. A new upstream migration that touches a column the fork moved fails on the OpenTranscripts database: adapt it, and keep its name.
- **Workspaces.** A workspace of OpenTranscripts has no city (`genericWorkspaceWhere` in `src/lib/db/workspaces.ts`). The workspace routes act only on those. Authorization accepts a workspace id where it accepts a city id.
- **Generic mode hides OpenCouncil.** `src/lib/genericMode.ts` has `isGenericMode()`, `appName()` and `GENERIC_MODE_ADMIN_PAGES`. The proxy serves only the paths in `src/lib/genericModePaths.ts`, so a new upstream page or route stays hidden until someone adds it there. New user-facing text that names OpenCouncil in a shared component must use `appName()`.
- **MCP.** In generic mode `src/lib/mcp/server.ts` registers the workspace tools only, `requireVisibleMeeting` in `src/lib/mcp/gate.ts` reads workspace transcripts, and `mayUseGenericModeMcp` in `src/lib/mcp/adminAccess.ts` admits superadmins only. A new upstream tool stays out of generic mode until someone adds it.
- **Vercel keeps its own cache.** `next.config.mjs` turns the Valkey cache handler off when `VERCEL` is set. Keep that condition when upstream changes the cache settings.
- **Tests run in council mode.** `jest.setup.js` and `tests/setup-integration.ts` set `NEXT_PUBLIC_APP_MODE=council`. A test of generic mode mocks `isGenericMode`.

## Steps

Each step ends with a check. Stop and report when a check fails.

### 1. Read what comes in

```bash
git fetch origin main && git fetch fork opentranscripts
git log --oneline fork/opentranscripts..origin/main | wc -l
git log --oneline fork/opentranscripts..origin/main -- prisma/ src/lib/db src/lib/tasks src/lib/mcp src/proxy.ts src/components/layout
```

Done when: you tell the user how many commits come in, and which of them touch the fork's areas and the schema.

### 2. Back up and rebase in a worktree

```bash
git branch backup/opentranscripts-pre-rebase-$(date +%Y%m%d) fork/opentranscripts
git push fork backup/opentranscripts-pre-rebase-$(date +%Y%m%d)   # with the user's go
git worktree add ../opentranscripts-rebase -b opentranscripts-rebase fork/opentranscripts
cd ../opentranscripts-rebase
git -c rerere.enabled=true rebase origin/main
```

Resolve each conflict by the fork rules. Keep each fork commit about one thing, as it was.

Done when: the rebase ends, and `git log --oneline origin/main..HEAD` shows the fork's commits on the new main.

### 3. Run the checks

```bash
npm ci
nix develop --command npm run prisma:generate
nix develop --command npx tsc --project tsconfig.jest.json --noEmit
nix develop --command npm run lint
nix develop --command npm test
nix develop --command npm run test:integration
NEXT_PUBLIC_APP_MODE=generic NODE_OPTIONS=--max-old-space-size=8192 nix develop --command npm run build
```

Fix a failure in the fork commit that caused it (a `fixup!` commit, then `git rebase -i --autosquash origin/main`), not in a new commit on top.

Done when: all seven commands pass. A failure that the same test also has on `origin/main` is upstream's: report it, and do not fix it here.

### 4. Rehearse the migrations on a copy of production

Production is read once, by `pg_dump`, with a read-only URL. The user puts the URL into `~/.config/opentranscripts/prod-readonly-url` (one line, mode 600). Never ask for it in the chat, and never print it.

```bash
docker run -d --name ot-rehearsal -e POSTGRES_PASSWORD=pw -p 55433:5432 postgis/postgis:16-3.5
pg_dump --format=custom --no-owner --no-acl --file=ot-prod.dump "$(cat ~/.config/opentranscripts/prod-readonly-url)"
createdb -h localhost -p 55433 -U postgres ot_rehearsal
scripts/opentranscripts-transition/restore-dump.sh ot-prod.dump postgresql://postgres:pw@localhost:55433/ot_rehearsal
```

Count the content (`Workspace`, `Transcript`, `Speaker`, `SpeakerTag`, `SpeakerSegment`, `Utterance`, `TaskStatus`, `Administers`, `User`) with `SELECT count(*)`. Then run the new migrations on the copy:

```bash
DATABASE_URL=postgresql://postgres:pw@localhost:55433/ot_rehearsal DIRECT_URL=postgresql://postgres:pw@localhost:55433/ot_rehearsal \
  nix develop --command npx prisma migrate deploy
```

Done when: `migrate deploy` applies every new migration, and the counts are the same as before it.

The scripts `transition.sh` and `dry-run.sh` in `scripts/opentranscripts-transition/` are for the one-time move from the old fork schema (November 2026). A rebase does not need them.

### 5. Check generic mode on the copy

Write a git-ignored `.env` in the worktree with the copy as `DATABASE_URL` and `DIRECT_URL`, `NEXT_PUBLIC_APP_MODE=generic`, `DEPLOYMENT_ENV=development`, `NEXTAUTH_URL=http://localhost:3000`, `DEV_EMAIL_OVERRIDE=<the user's address>`, a local `TASK_API_URL`, and dummy values for storage and every other service. Start the app with `nix develop --command npx next dev -H localhost -p 3000`: `next dev` reads this `.env`, and QuickLogin works there. Sign in with QuickLogin or `POST /api/dev/quick-login`.

```bash
node scripts/check-generic-mode.mjs http://localhost:3000 member='<cookie>' superadmin='<cookie>'
git diff --name-only --diff-filter=A fork/opentranscripts..HEAD -- 'src/app/**/page.tsx' 'src/app/api/**/route.ts'
```

Add `--ignore=REGEX` only for data that names OpenCouncil, such as a workspace that a user called so.

Done when: the script passes, and you list the new upstream pages and routes for the user, who decides whether any of them belongs in `src/lib/genericModePaths.ts`.

### 6. Smoke test with the user

In the browser, on the copy: the landing page, the workspaces list, a workspace, a transcript (playback, a click on a line, an inline edit, a speaker rename), the DOCX and SRT exports, the members and tasks settings, `/admin`, `/mcp` as a superadmin.

Done when: the user has seen each item work.

### 7. Deploy, with the user's go

```bash
git push --force-with-lease=opentranscripts:$(git rev-parse fork/opentranscripts) fork opentranscripts-rebase:opentranscripts
```

The deploy runs the new migrations. Then repeat the smoke test on production.

Done when: the deploy succeeded and the smoke test passed.

### Rollback

Force-push `opentranscripts` back to the backup branch. If the deploy ran a migration that the old code cannot read, restore the database from the backup of the day first, after the user's go. Rows written after that backup are lost then, so decide early.

### Clean up

Remove the worktree, the rehearsal container (`docker rm -f ot-rehearsal`) and the dump file. The dump holds personal data: delete it, do not keep it in the repository.

<!-- BEGIN shared-doctrine: synced from ~/.dotfiles/agents/AGENTS.md — edit there, run agents-sync -->

# First Principle: Vertical Slices

Every change must deliver end-to-end user value. Never build a layer (schema, API, sync) without the corresponding UI that makes it visible and useful to the user.

- Bad: "Add subtasks table and sync logic" (user sees nothing)
- Good: "Add subtasks that sync from Asana and display as a checklist on the task detail page"

A feature is not done until the user can see it and interact with it. If a story doesn't change what the user experiences, it's not a story. When planning work, always ask: "What will the user see or do differently after this ships?" If you can't answer that, the scope is wrong.

# Subagents and run scope

Ask before spawning subagents. Eager models fan out on their own and each child can inherit the parent's model and reasoning level, so an unasked-for fan-out can burn a large share of a usage window in a single run. When you think a task warrants subagents, propose it and wait — don't spin them up unprompted. (This doesn't apply when I've already asked for orchestration or named a workflow — that's the ask.)

Bound how far a run goes before it checks in. Capable models will happily run a task end-to-end past the point where I'd have wanted to weigh in, and an unbounded run is the most likely way to blow a budget. Prefer clear stop points: finish the plan and stop for feedback before building; complete the bounded chunk and report before taking on the next. When a request has no natural stop point, pick one and say where you're stopping and why, rather than running until you decide you're done.

Both rules above assume a human is in the loop. When running non-interactively — a headless/`-p` run, a cron job, or any context with no one to consult — they don't apply: spawn whatever subagents the task needs and run to completion, since stopping to "ask" or "check in" just deadlocks against a human who isn't there.

# Dev Setup

## Dev logs
Projects should log dev server output to `logs/dev.log` so the agent can read them without running the server.

Setup (once per project):
```bash
mkdir -p logs && touch logs/dev.log
echo '/logs' >> .gitignore
```

Then update the dev script in `package.json`. The shape is `truncate logs/dev.log && <runner> 2>&1 | tee logs/dev.log` — wrap whatever the project's actual dev runner is, with or without a proxy/wrapper in front:

```json
// Plain Next.js
"dev": "truncate -s 0 logs/dev.log && next dev 2>&1 | tee logs/dev.log"

// Wrapped (e.g. portless, ngrok, cloudflared, doppler run, dotenv-cli, etc.)
"dev": "truncate -s 0 logs/dev.log && portless run next dev 2>&1 | tee logs/dev.log"
```

The `tee` must sit on the outermost command so all wrapper + child output is captured. If a project doesn't have this set up, remind the user.

<!-- END shared-doctrine -->

# Diagnosing production: `sift` CLI and Vercel logs

When a user reports "sync stopped", "nothing is getting tagged", or similar, check production health before reading code:

```bash
npm run sift -- login                      # once; browser sign-in, token saved to ~/.config/sift/credentials (0600)
npm run sift -- health                     # last 24h for *your* account: last sync, emails ingested, tagged/untagged, corrections, integration tasks
npm run sift -- health --since 7d --json   # machine-readable; --since takes 30m / 24h / 7d (max 30d)
npm run sift -- emails                     # recent emails (last 24h): id, date, inbox/archived/deleted, tags, linked tasks; no subject/from/snippet
npm run sift -- emails --untagged --since 7d --limit 100 --json   # why isn't this getting tagged? (also --archived | --deleted, max --limit 200)
npm run sift -- email <id>                 # one email (Sift id or Gmail message id): tags w/ source+confidence, corrections, activity log, integration tasks
npm run sift -- email <id> --show-content --json   # opt in to subject/from/snippet/task names; content is omitted by default, only ask for it when you need it
npm run sift -- logout                     # revokes the token server-side and deletes it locally
```

- `health` only ever shows the signed-in user's own data (`GET /api/diagnostics/health`, behind `withAuth`). It answers "is the pipeline producing results?", not "why did it fail?". Read its `warnings` first.
- `SIFT_API_URL` picks the server (default: production). Use `SIFT_API_URL=http://localhost:3003` against `npm run dev`, or a preview deployment URL. Logins are stored per URL. Deployments behind Vercel deployment protection can't be reached; the CLI says so.
- Exit code is non-zero when not logged in or the token is expired/revoked. Run `sift login` again.

For the *why* (exceptions, stack traces, cron/sync failures), use runtime logs. `sift health` doesn't expose them:

```bash
vercel logs <deployment-url>          # stream runtime logs for a deployment
vercel logs <deployment-url> --json   # structured, for grepping
```

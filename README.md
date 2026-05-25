# ANT

[![CI](https://github.com/AntMemory/ANT/actions/workflows/ci.yml/badge.svg)](https://github.com/AntMemory/ANT/actions/workflows/ci.yml)

ANT is alpha local-first memory software for AI coding agents. It stores solved coding issues as structured memories so future agents can search for prior fixes instead of rediscovering them from scratch.

ANT is not a chat-log archive. A memory is a small, explicit bugfix record: problem, error signature, context, cause, solution, evidence, and privacy metadata.

## Why It Exists

AI coding agents repeatedly hit the same practical failures: framework version changes, package quirks, build errors, environment traps, and subtle fix patterns. Those fixes are usually lost in terminal output or chat history.

ANT keeps the durable part: what broke, why it broke, how it was fixed, and how the fix was verified. Users should inspect memories before sharing them outside a local machine.

## Quickstart

From a fresh clone:

```bash
npm ci
npm run build
npm run demo
npm run test:e2e
```

That is the quickest way to see the full loop: local memory save/search, redaction, local cloud API sync, global search, and MCP smoke coverage inside the E2E run.

## How It Works

- Local memories are stored in SQLite at `.ant/memory.sqlite`.
- `ant remember` saves a solved issue using the strict ANT schema.
- `ant search` searches local memories.
- `ant mcp` exposes the same local store to MCP-compatible agents.
- Redaction runs locally before memories are saved.
- Cloud sync alpha can upload only redacted, public-safe memories to a shared API. Inspect memories before syncing.

## Install And Setup

From source:

```bash
npm ci
npm run build
ant init
```

For development:

```bash
npm start -- init
```

If `ant` is not linked on your machine, use:

```bash
node dist/cli.js init
```

Most scripts use the built local CLI under `dist/`, so `npm run demo` and `npm run test:e2e` work even before you install ANT globally.

Package alpha checks:

```bash
npm run typecheck
npm run verify:pack
```

The npm package is intended to contain the built `dist/` CLI files plus project docs such as `README.md` and `LICENSE`. Tests, scripts, temporary databases, logs, and website source are not part of the published package.

If installed from an alpha npm package, the CLI entrypoint is:

```bash
ant init
```

## Running The Demo

```bash
npm run demo
```

The demo is designed for showing ANT to someone else. It:

1. Creates a clean temporary ANT database.
2. Saves a sample bugfix memory.
3. Searches it locally.
4. Redacts a fake secret log.
5. Starts the local cloud API.
6. Syncs the public-safe memory.
7. Searches it globally.

No real project database is modified.

## CLI Usage

Initialize a local memory database:

```bash
ant init
```

Save a memory interactively:

```bash
ant remember
```

Save from JSON:

```bash
ant remember --json examples/memories/nextjs-15-params.json
```

Import an error log as a structured local memory:

```bash
ant remember --from-file error.log
```

Ingest an agent or build log as a pending draft:

```bash
ant ingest examples/logs/npm-nextjs.log
ant ingest examples/logs/python-django.log
ant ingest examples/logs/docker-build.log
ant ingest examples/logs/npm-nextjs.log --interactive
ant drafts
ant complete <draft_id>
```

Search local memories:

```bash
ant search "nextjs params promise"
```

Inspect saved memories:

```bash
ant inspect
```

Preview redaction for a file:

```bash
ant redact error.log
```

List memories that are not currently public-safe:

```bash
ant inspect-pending
```

Cloud alpha commands:

```bash
ant cloud
ant sync
ant search --global "prisma generate cache"
ant worked <memory_id>
ant failed <memory_id>
```

## MCP Usage

ANT includes an MCP stdio server backed by the same local SQLite database. This is an alpha integration surface.

Run it:

```bash
ant mcp
```

Example agent configuration:

```json
{
  "mcpServers": {
    "ant": {
      "command": "ant",
      "args": ["mcp"],
      "cwd": "/path/to/project"
    }
  }
}
```

MCP tools:

- `search_memory`
- `save_memory`
- `inspect_memories`
- `mark_memory_worked`
- `mark_memory_failed`

`search_memory` accepts a query and optional context such as language, framework, package name, package version, runtime, OS, and tool. Results include a deterministic heuristic relevance score.

## Redaction And Privacy

ANT runs deterministic local redaction before saving sensitive memory fields:

- `title`
- `problem`
- `error_signature`
- `context.language`
- `context.framework`
- `context.package_name`
- `context.package_version`
- `context.runtime`
- `context.os`
- `context.tool`
- `cause`
- `solution.summary`
- `solution.steps`
- `solution.commands`
- `solution.patch_example`
- `evidence.verification_type`
- `evidence.commands_run`

The redactor uses regex and simple entropy checks. It does not use an LLM, and it cannot guarantee that every private identifier or novel secret format will be caught.

Current checks cover:

- API keys, tokens, and passwords
- private keys
- `.env` values
- database URLs
- emails
- local home paths
- usernames
- project names where detectable

Privacy metadata is stored with every memory:

```ts
privacy: {
  redacted: boolean;
  public_safe: boolean;
  redaction_warnings: string[];
}
```

`ant inspect-pending` shows memories where `public_safe` is false.

Cloud sync refuses memories that are not public-safe and also blocks memories carrying high-severity redaction warnings such as API keys, tokens, passwords, private keys, `.env` values, database URLs, or high-entropy secrets.

## Cloud Sync Alpha

Cloud sync is an alpha feature for sharing redacted, public-safe memories across machines. It is not production collaboration infrastructure and has no dashboard, team management, billing, or authentication yet.

Start the local API:

```bash
npm run dev:api
```

Compiled API:

```bash
npm run build
npm run cloud
```

The API listens on `http://localhost:3737` by default. Set `PORT` to change it.

Storage:

- Uses Postgres when `DATABASE_URL` starts with `postgres`.
- Otherwise uses SQLite at `.ant-cloud/cloud.sqlite`.

Cloud commands:

```bash
ant sync
ant search --global "prisma generate cache"
ant worked <memory_id>
ant failed <memory_id>
```

Use `ANT_CLOUD_URL` for a non-local API:

```bash
ANT_CLOUD_URL=https://example.com ant sync
```

Safety rules:

- Only `privacy.public_safe = true` memories sync.
- High-severity redaction warnings block sync.
- Raw files and raw chat logs are never synced.

## Quality Scoring And Ranking

ANT search does more than plain text matching. Local, MCP, and global search use deterministic scoring based on:

- text relevance to the query
- exact or near-exact `error_signature` matches
- context matches such as language, framework, package, version, runtime, OS, and tool
- evidence quality
- worked/failed reuse counts
- a small freshness boost

Search results show:

- memory id
- title
- score
- confidence label: `low`, `medium`, or `high`
- ranking reason
- cause
- solution steps
- evidence
- worked and failed counts

Global search excludes memories where `privacy.public_safe = false`.

Search and ranking are deterministic heuristics, not ML ranking or semantic search. Scores should be treated as a sorting aid, not a correctness guarantee.

## Tests

```bash
npm test
npm run test:mcp
npm run test:e2e
```

## Current Limitations

- ANT is alpha software and APIs, storage, and CLI output may change.
- Redaction is deterministic and conservative, not semantic.
- Redaction can miss unusual secret formats, business-specific identifiers, or private terms that do not match the current rules.
- Users should inspect memories before sharing or syncing them.
- Public-safe metadata is a local safety signal, not a formal security review.
- Cloud sync alpha has no authentication or authorization model yet.
- No dashboard.
- No payments or team management.
- No conflict resolution beyond upserting memories by id.
- Ranking is simple and transparent, not ML-based.
- Postgres support is minimal and expects a working `DATABASE_URL`.

## Roadmap

- Stronger privacy review workflow before public sharing.
- Authentication for cloud sync.
- Better deduplication and merge behavior.
- More useful ranking from reuse outcomes and context.
- Import/export workflows.
- Optional dashboard after the core memory model stabilizes.

# ANT

ANT is a local-first memory tool for AI coding agents. It stores solved coding issues as structured memories so future agents can search for prior fixes instead of rediscovering them from scratch.

ANT is not a chat-log archive. A memory is a small, explicit bugfix record: problem, error signature, context, cause, solution, evidence, and privacy metadata.

## Why It Exists

AI coding agents repeatedly hit the same practical failures: framework version changes, package quirks, build errors, environment traps, and subtle fix patterns. Those fixes are usually lost in terminal output or chat history.

ANT keeps the durable part: what broke, why it broke, how it was fixed, and how the fix was verified.

## How It Works

- Local memories are stored in SQLite at `.ant/memory.sqlite`.
- `ant remember` saves a solved issue using the strict ANT schema.
- `ant search` searches local memories.
- `ant mcp` exposes the same local store to MCP-compatible agents.
- Redaction runs locally before memories are saved.
- Cloud sync alpha can upload only redacted, public-safe memories to a shared API.

## Install And Setup

```bash
npm install
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

## CLI Usage

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

## MCP Usage

ANT includes an MCP stdio server backed by the same local SQLite database.

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

`search_memory` accepts a query and optional context such as language, framework, package name, package version, runtime, OS, and tool. Results include a relevance score.

## Redaction And Privacy

ANT runs deterministic local redaction before saving sensitive memory fields:

- `problem`
- `error_signature`
- `cause`
- `solution.summary`
- `solution.steps`
- `solution.commands`
- `solution.patch_example`

The redactor uses regex and simple entropy checks. It does not use an LLM.

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

## Cloud Sync Alpha

Cloud sync is an alpha feature for sharing redacted, public-safe memories across machines.

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

## Demo

Run a polished local demo:

```bash
npm run demo
```

The demo creates a clean temp database, saves a sample bugfix memory, searches locally, redacts a fake secret log, starts the local cloud API, syncs the memory, and searches globally.

## Tests

```bash
npm test
npm run test:mcp
npm run test:e2e
```

## Current Limitations

- Redaction is deterministic and conservative, not semantic.
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

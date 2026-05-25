import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const githubUrl = "https://github.com/AntMemory/ANT";

type DocPage = {
  title: string;
  description: string;
  sections: Array<{
    heading: string;
    body?: string;
    code?: string;
    bullets?: string[];
  }>;
};

const docs: Record<string, DocPage> = {
  "/docs/quickstart": {
    title: "Quickstart",
    description: "Clone the repo, install locked dependencies, build ANT, run the demo, and verify the E2E flow.",
    sections: [
      {
        heading: "Install",
        code: "npm ci\nnpm run build\nnpm run demo\nnpm run test:e2e"
      },
      {
        heading: "Run The Demo",
        body: "The demo uses clean temporary databases, starts the local cloud API, saves a memory, redacts a fake secret log, syncs, and searches globally.",
        code: "npm run demo"
      },
      {
        heading: "Verify The Full Flow",
        code: "npm run test:e2e"
      },
      {
        heading: "Use The CLI",
        code: "ant init\nant remember --json examples/memories/nextjs-15-params.json\nant search \"nextjs params promise\""
      },
      {
        heading: "Ingest Logs",
        code:
          "ant ingest examples/logs/npm-nextjs.log\nant ingest examples/logs/python-django.log\nant ingest examples/logs/docker-build.log\nant drafts\nant complete <draft_id>"
      }
    ]
  },
  "/docs/mcp": {
    title: "MCP Setup",
    description: "Expose the local alpha ANT memory store to MCP-compatible AI coding agents.",
    sections: [
      {
        heading: "Check Setup",
        code: "ant mcp config\nant mcp doctor"
      },
      {
        heading: "Run The Server",
        code: "ant mcp"
      },
      {
        heading: "Agent Configuration",
        code: JSON.stringify(
          {
            mcpServers: {
              ant: {
                command: "ant",
                args: ["mcp"]
              }
            }
          },
          null,
          2
        )
      },
      {
        heading: "Cursor",
        body: "Run ant mcp doctor, then paste the JSON from ant mcp config into Cursor's MCP configuration. For project-scoped setup, use .cursor/mcp.json in the project root."
      },
      {
        heading: "Claude Desktop",
        body: "Open Claude Desktop settings, use the Developer MCP configuration editor, paste the ant mcp config JSON into claude_desktop_config.json, then restart Claude Desktop."
      },
      {
        heading: "Generic Client",
        body: "Use stdio transport with command ant and args [\"mcp\"]. Set the working directory to the project where the local .ant database should live."
      },
      {
        heading: "Tools",
        bullets: ["search_memory", "save_memory", "inspect_memories", "mark_memory_worked", "mark_memory_failed"]
      },
      {
        heading: "Troubleshooting",
        bullets: [
          "Run ant mcp doctor first",
          "Run ant init if the database check fails",
          "Use an absolute CLI path if the client cannot find ant",
          "Run npm run test:mcp to exercise the MCP tools locally"
        ]
      }
    ]
  },
  "/docs/privacy": {
    title: "Privacy And Redaction",
    description: "ANT uses deterministic local redaction before saving and before any cloud sync eligibility. Users should inspect memories before sharing.",
    sections: [
      {
        heading: "Preview Redaction",
        code: "ant redact error.log"
      },
      {
        heading: "What Gets Checked",
        bullets: [
          "API keys, tokens, passwords, and private keys",
          ".env values and database URLs",
          "emails, usernames, home paths, and project names where detectable"
        ]
      },
      {
        heading: "Pending Review",
        body: "Memories with privacy.public_safe = false stay local and appear in the pending list.",
        code: "ant inspect-pending"
      },
      {
        heading: "Limitations",
        body: "Redaction is regex and entropy based. It can miss unusual secret formats or project-specific private terms."
      }
    ]
  },
  "/docs/cloud": {
    title: "Cloud Sync Alpha",
    description: "Alpha sync for redacted, public-safe memories. It is not production team infrastructure.",
    sections: [
      {
        heading: "Start The Local API",
        code: "npm run dev:api"
      },
      {
        heading: "Optional Token",
        body: "Set ANT_CLOUD_TOKEN to require bearer-token auth for upload, search, worked, and failed routes. Without it, the API is local unauthenticated alpha mode.",
        code: "ANT_CLOUD_TOKEN=change-me npm run dev:api\nANT_CLOUD_TOKEN=change-me ant sync"
      },
      {
        heading: "Sync And Search",
        code: "ant sync\nant search --global \"prisma generate cache\"\nant worked <memory_id>\nant failed <memory_id>"
      },
      {
        heading: "Safety Rules",
        bullets: [
          "Only public-safe memories sync",
          "High-severity redaction warnings block sync",
          "Draft or incomplete memories do not sync",
          "Raw files and raw chat logs are never synced",
          "Inspect memories before sharing",
          "Do not expose the alpha API publicly without a reverse proxy and rate limiting"
        ]
      }
    ]
  }
};

function App() {
  const path = window.location.pathname;
  if (docs[path]) {
    return <DocsPage page={docs[path]} />;
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero" id="top">
          <div className="heroCopy">
            <p className="eyebrow">Alpha local-first memory for coding agents</p>
            <h1>Every bug should only be solved once.</h1>
            <p className="subtitle">ANT stores structured bugfix memories for AI coding agents.</p>
            <div className="ctaRow">
              <a className="button primary" href={githubUrl}>
                GitHub
              </a>
              <a className="button secondary" href="/docs/quickstart">
                Quickstart
              </a>
            </div>
          </div>
          <div className="memoryVisual" aria-label="ANT memory search result preview">
            <div className="visualBar">
              <span />
              <span />
              <span />
            </div>
            <div className="scoreBadge">score 87.5 - high</div>
            <h2>Next.js 15 params must be awaited</h2>
            <p>PageProps params Promise error</p>
            <ol>
              <li>Type params as Promise&lt;&#123; slug: string &#125;&gt;</li>
              <li>Use const &#123; slug &#125; = await params</li>
              <li>Run npm run build</li>
            </ol>
          </div>
        </section>

        <Section
          id="problem"
          title="Problem"
          body="AI agents fix the same framework, package, and build issues repeatedly because the useful part of the fix is buried in chat logs or terminal history."
        />
        <Section
          id="how"
          title="How It Works"
          body="ANT stores explicit bugfix memories in SQLite: title, problem, error signature, context, cause, solution, evidence, and privacy metadata."
        />
        <Section
          id="privacy"
          title="Privacy"
          body="Deterministic redaction runs locally before memories are saved. It is not perfect, and users should inspect memories before syncing."
        />
        <Section
          id="mcp"
          title="MCP"
          body="Run ant mcp to expose search, save, inspect, worked, and failed tools to MCP-compatible coding agents."
        />
        <Section
          id="cloud"
          title="Cloud Sync Alpha"
          body="The alpha API syncs redacted, public-safe memories so another machine can search prior fixes. No production dashboard, auth, billing, or team features yet."
        />
        <Section
          id="quality"
          title="Quality Scoring"
          body="Search uses deterministic heuristics: text match, error-signature match, context, evidence quality, worked/failed counts, and freshness. It is not ML or semantic magic."
        />
        <Section
          id="limitations"
          title="Known Limitations"
          body="ANT is alpha software. Redaction can miss secrets, cloud sync is experimental, and production dashboard, team, and billing features do not exist yet."
        />
      </main>
      <SiteFooter />
    </>
  );
}

function DocsPage({ page }: { page: DocPage }) {
  return (
    <>
      <SiteHeader />
      <main className="docLayout">
        <aside className="docNav" aria-label="Documentation">
          <a href="/docs/quickstart">Quickstart</a>
          <a href="/docs/mcp">MCP setup</a>
          <a href="/docs/privacy">Privacy/redaction</a>
          <a href="/docs/cloud">Cloud sync alpha</a>
        </aside>
        <article className="docArticle">
          <p className="eyebrow">Docs</p>
          <h1>{page.title}</h1>
          <p className="docLead">{page.description}</p>
          {page.sections.map((section) => (
            <section key={section.heading} className="docSection">
              <h2>{section.heading}</h2>
              {section.body ? <p>{section.body}</p> : null}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {section.code ? <pre>{section.code}</pre> : null}
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

function SiteHeader() {
  return (
    <header className="siteHeader">
      <a className="brand" href="/">
        ANT
      </a>
      <nav>
        <a href="/docs/quickstart">Docs</a>
        <a href="/docs/mcp">MCP</a>
        <a href="/docs/cloud">Cloud Alpha</a>
        <a href={githubUrl}>GitHub</a>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="siteFooter">
      <span>ANT is local-first. Cloud sync is alpha.</span>
      <a href="/docs/privacy">Privacy model</a>
    </footer>
  );
}

function Section({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <section className="band" id={id}>
      <div className="bandInner">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

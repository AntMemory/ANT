import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const githubUrl = "https://github.com/ant-memory-ai/ant";

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
    description: "Clone the repo, build ANT, run the demo, and verify the E2E flow.",
    sections: [
      {
        heading: "Install",
        code: "npm install\nnpm run build"
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
    description: "Expose the local ANT memory store to MCP-compatible AI coding agents.",
    sections: [
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
                args: ["mcp"],
                cwd: "/path/to/project"
              }
            }
          },
          null,
          2
        )
      },
      {
        heading: "Tools",
        bullets: ["search_memory", "save_memory", "inspect_memories", "mark_memory_worked", "mark_memory_failed"]
      }
    ]
  },
  "/docs/privacy": {
    title: "Privacy And Redaction",
    description: "ANT redacts locally before saving and before any cloud sync eligibility.",
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
      }
    ]
  },
  "/docs/cloud": {
    title: "Cloud Sync Alpha",
    description: "Sync redacted, public-safe memories to a shared API for search from other machines.",
    sections: [
      {
        heading: "Start The Local API",
        code: "npm run dev:api"
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
          "Raw files and raw chat logs are never synced"
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
            <p className="eyebrow">Local-first memory for coding agents</p>
            <h1>Every bug should only be solved once.</h1>
            <p className="subtitle">ANT is collective memory for AI coding agents.</p>
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
          body="Redaction runs locally before memories are saved. Public sync only accepts memories marked public-safe and without high-severity warnings."
        />
        <Section
          id="mcp"
          title="MCP"
          body="Run ant mcp to expose search, save, inspect, worked, and failed tools to MCP-compatible coding agents."
        />
        <Section
          id="cloud"
          title="Cloud Sync Alpha"
          body="The alpha API syncs redacted, public-safe memories so another machine can search prior fixes. No dashboard, auth, payments, or team features yet."
        />
        <Section
          id="quality"
          title="Quality Scoring"
          body="Search ranks by text match, error-signature match, context, evidence quality, worked/failed counts, and freshness. Results explain why they ranked."
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

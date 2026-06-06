import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const githubUrl = "https://github.com/AntMemory/ANT";

type Highlight = {
  label: string;
  value: string;
};

type LandingSection = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
};

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

const highlights: Highlight[] = [
  { label: "Storage", value: "SQLite local-first" },
  { label: "Agent surface", value: "MCP tools" },
  { label: "Safety", value: "Local redaction first" }
];

const workflow = [
  {
    title: "Run",
    body: "Wrap a real command with ANT and stream the output as usual.",
    command: "ant run -- npm run build"
  },
  {
    title: "Redact",
    body: "Failed output is captured into a temporary redacted log.",
    command: "API keys, paths, emails removed"
  },
  {
    title: "Remember",
    body: "ANT creates a draft with error signature and detected context.",
    command: "Draft ID: 8b4..."
  },
  {
    title: "Reuse",
    body: "Similar verified fixes are suggested to the agent immediately.",
    command: "3 local memories found"
  }
];

const quickstartCards = [
  {
    label: "Clone",
    title: "Install and build",
    command: "npm ci\nnpm run build"
  },
  {
    label: "Demo",
    title: "See the full loop",
    command: "npm run demo"
  },
  {
    label: "Doctor",
    title: "Check local setup",
    command: "node dist/cli.js doctor"
  },
  {
    label: "Ship",
    title: "Run confidence checks",
    command: "npm run check"
  }
];

const trustItems = [
  {
    title: "Local by default",
    body: "Memories live in SQLite until you choose to sync public-safe records."
  },
  {
    title: "Redaction first",
    body: "Secrets and private paths are removed before memories are saved or shared."
  },
  {
    title: "Evidence matters",
    body: "Search shows scores, confidence, and why a memory ranked where it did."
  }
];

const landingSections: LandingSection[] = [
  {
    id: "problem",
    kicker: "Problem",
    title: "Agents forget the useful part.",
    body:
      "The fix for a framework upgrade, build failure, or package quirk usually disappears into terminal scrollback. ANT keeps the small structured record that can actually help next time.",
    points: ["No raw chat-log archive", "No dashboard dependency", "No cloud required"]
  },
  {
    id: "how",
    kicker: "How it works",
    title: "Save bugfixes as structured memories.",
    body:
      "A memory captures the problem, error signature, context, cause, solution, verification evidence, and privacy metadata. Search can then rank prior fixes by relevance and trust signals.",
    points: ["Strict schema", "Deduplication and merge", "Deterministic ranking"]
  },
  {
    id: "privacy",
    kicker: "Privacy",
    title: "Redaction happens before sharing.",
    body:
      "ANT redacts locally before storing sensitive fields and blocks cloud sync for unsafe or incomplete memories. The redactor is deterministic, useful, and intentionally described as imperfect.",
    points: ["Secrets and private paths", "Pending review list", "Public-safe gate"]
  },
  {
    id: "mcp",
    kicker: "MCP",
    title: "Expose memory to coding agents.",
    body:
      "The MCP server gives compatible agents tools to search, save, inspect, and mark memories worked or failed, all backed by the same local SQLite database as the CLI.",
    points: ["ant mcp config", "ant mcp doctor", "Local stdio server"]
  },
  {
    id: "cloud",
    kicker: "Cloud sync alpha",
    title: "Share only public-safe memories.",
    body:
      "The alpha API syncs redacted memories for cross-machine search. It has minimal token auth and safety gates, but it is not production collaboration infrastructure yet.",
    points: ["Public-safe only", "High-warning block", "No team dashboard"]
  },
  {
    id: "quality",
    kicker: "Quality scoring",
    title: "Rank by usefulness, not just text.",
    body:
      "Search combines text relevance, error-signature matches, context, evidence quality, worked and failed counts, and freshness. It is transparent heuristic scoring, not ML ranking.",
    points: ["Score and confidence", "Ranking reason", "Reuse feedback"]
  }
];

const docs: Record<string, DocPage> = {
  "/docs/quickstart": {
    title: "Quickstart",
    description: "Clone the repo, build ANT, run the demo, and try the CLI against a local SQLite database.",
    sections: [
      {
        heading: "Fresh clone",
        code: "npm ci\nnpm run build\nnpm run demo\nnpm run test:e2e"
      },
      {
        heading: "Health check",
        body: "Use doctor when setup feels uncertain. It checks the local database, redaction, MCP tool registration, runtime, and cloud API configuration.",
        code: "node dist/cli.js doctor\nant doctor"
      },
      {
        heading: "Full confidence sweep",
        body: "For a local release-style pass, run the check script. It executes tests, builds, E2E, MCP smoke, demo, website build, and package verification.",
        code: "npm run check"
      },
      {
        heading: "Demo",
        body:
          "The demo uses temporary databases, starts the local cloud API, saves a memory, redacts a fake secret log, syncs, and searches globally.",
        code: "npm run demo"
      },
      {
        heading: "Local memory loop",
        code:
          "ant init\nant doctor\nant remember --json examples/memories/nextjs-15-params.json\nant edit <memory_id> --json examples/memories/nextjs-15-params.json\nant search \"nextjs params promise\"\nant inspect"
      },
      {
        heading: "Ingest logs",
        code:
          "ant ingest examples/logs/npm-nextjs.log\nant ingest examples/logs/python-django.log\nant ingest examples/logs/docker-build.log\nant drafts\nant complete <draft_id>"
      },
      {
        heading: "Command runner",
        body: "Wrap a debugging command. Passing commands do not create drafts; failing commands create redacted draft memories and suggest similar local memories.",
        code: "ant run -- npm run build\nant run --save-log -- npm test\nant run --no-search -- npm run typecheck"
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
        body:
          "Run ant mcp doctor, then paste the JSON from ant mcp config into Cursor's MCP configuration. For project-scoped setup, use .cursor/mcp.json in the project root."
      },
      {
        heading: "Claude Desktop",
        body:
          "Open Claude Desktop settings, use the Developer MCP configuration editor, paste the ant mcp config JSON into claude_desktop_config.json, then restart Claude Desktop."
      },
      {
        heading: "Generic Client",
        body:
          "Use stdio transport with command ant and args [\"mcp\"]. Set the working directory to the project where the local .ant database should live."
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
        heading: "Sync gate",
        body:
          "Cloud sync refuses incomplete drafts, memories where privacy.public_safe is not true, and memories with high-severity redaction warnings."
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
        body:
          "Sync reports synced, skipped, and failed counts. Safety skips are nonfatal; upload or API failures make the command exit nonzero.",
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
  },
  "/docs/ranking": {
    title: "Quality Ranking",
    description: "ANT search uses deterministic scoring so agents can see why one memory ranked above another.",
    sections: [
      {
        heading: "Signals",
        bullets: [
          "Text relevance",
          "Exact or near-exact error signature",
          "Language, framework, package, version, runtime, OS, and tool context",
          "Evidence quality",
          "Worked and failed counts",
          "Small freshness boost"
        ]
      },
      {
        heading: "Output",
        code:
          "ID: <memory_id>\nScore: 87.5\nConfidence: high\nRanking reason: exact error signature; framework match; test passed"
      },
      {
        heading: "Limits",
        body: "Ranking is a transparent heuristic. It is not semantic search, ML ranking, or a guarantee that a fix applies."
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
          <HeroScene />
          <div className="brandHero" aria-label="ANT learn collectively">
            <div>
              <span className="wordmark">ANT<span>.</span></span>
              <span className="tagline">learn collectively</span>
            </div>
          </div>
          <div className="heroCopy">
            <p className="eyebrow">Alpha local-first memory for coding agents</p>
            <h1>Every bug should only be solved once.</h1>
            <p className="subtitle">
              ANT gives AI coding agents a local memory of verified fixes, without storing raw chat logs.
              Save locally, redact first, search prior fixes, and sync only public-safe memories.
            </p>
            <div className="ctaRow">
              <a className="button accent" href="#demo">
                Run demo
              </a>
              <a className="button dark" href="/docs/quickstart">
                Quickstart
              </a>
              <a className="button light" href={githubUrl}>
                GitHub
              </a>
            </div>
            <div className="quickCommand" aria-label="Quickstart command">
              <span>$</span>
              <code>npm ci && npm run build && npm run demo</code>
            </div>
          </div>
          <div className="heroStats" aria-label="ANT capabilities">
            {highlights.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="quickstartBand" id="quickstart" aria-label="ANT quickstart">
          <div className="sectionIntro">
            <p className="eyebrow">Quickstart</p>
            <h2>From clone to confidence in four commands.</h2>
            <p>
              The fast path is intentionally boring: install dependencies, build the CLI, run the demo, then ask ANT to
              check its own local setup.
            </p>
          </div>
          <div className="quickstartGrid">
            {quickstartCards.map((item, index) => (
              <article className="quickstartCard" key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item.label}</p>
                <h3>{item.title}</h3>
                <CodeBlock code={item.command} />
              </article>
            ))}
          </div>
        </section>

        <section className="workflowBand" aria-label="How ANT works">
          <div className="sectionIntro">
            <p className="eyebrow">How ANT works</p>
            <h2>From failed command to reusable memory.</h2>
            <p>
              ANT fits into the debugging loop agents already use. It watches the failure, redacts sensitive output,
              drafts a structured memory, then searches for similar fixes before the agent starts guessing.
            </p>
          </div>
          <div className="workflowGrid">
            {workflow.map((step, index) => (
              <article className="workflowStep" key={step.title}>
                <span className="stepIndex" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <code>{step.command}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="introBand" aria-label="ANT quick explanation">
          <div>
            <p className="eyebrow">What ANT stores</p>
            <h2>A compact record of a solved coding issue.</h2>
          </div>
          <CodeBlock
            code={
              "title: Next.js 15 params must be awaited\nerror_signature: PageProps params Promise type error\ncause: App Router params are now async\nsolution: await params before destructuring\nevidence: npm run build passed"
            }
          />
        </section>

        {landingSections.map((section, index) => (
          <LandingBand key={section.id} section={section} tone={index % 2 === 0 ? "light" : "dark"} />
        ))}

        <section className="demoBand" id="demo">
          <div>
            <p className="eyebrow">Try it locally</p>
            <h2>One command shows the loop.</h2>
            <p>
              The demo starts from a temporary database, saves a sample memory, searches locally, redacts fake secrets,
              syncs to the local alpha API, and searches globally.
            </p>
          </div>
          <CodeBlock code={"npm run demo\nnpm run test:e2e\nant mcp doctor"} />
        </section>

        <section className="trustBand" aria-label="ANT trust model">
          <div className="sectionIntro">
            <p className="eyebrow">Alpha, honestly</p>
            <h2>Useful memory without pretending to be magic.</h2>
          </div>
          <div className="trustGrid">
            {trustItems.map((item) => (
              <article className="trustItem" key={item.title}>
                <span className="trustDot" aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function HeroScene() {
  return (
    <div className="heroScene" aria-hidden="true">
      <div className="antSilhouette">
        <img className="sideAntImage" src="/ant-side.png" alt="" />
      </div>
    </div>
  );
}

function LandingBand({ section, tone }: { section: LandingSection; tone: "light" | "dark" }) {
  return (
    <section className={`band ${tone}`} id={section.id}>
      <div className="bandCopy">
        <span className="sectionDot" aria-hidden="true" />
        <p className="eyebrow">{section.kicker}</p>
        <h2>{section.title}</h2>
        <p>{section.body}</p>
      </div>
      <div className="pointGrid" aria-label={`${section.kicker} highlights`}>
        {section.points.map((point) => (
          <div className="pointCard" key={point}>
            <span />
            <strong>{point}</strong>
          </div>
        ))}
      </div>
    </section>
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
          <a href="/docs/ranking">Quality ranking</a>
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
              {section.code ? <CodeBlock code={section.code} /> : null}
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
      <a className="brand" href="/" aria-label="ANT home">
        <img className="brandLogo" src="/ant-logo.png" alt="" />
        <span>ANT<span>.</span></span>
      </a>
      <nav>
        <a href="/docs/quickstart">Docs</a>
        <a href="/docs/mcp">MCP</a>
        <a href="/docs/cloud">Cloud Alpha</a>
        <a href="/#demo">Demo</a>
        <a href={githubUrl}>GitHub</a>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="siteFooter">
      <span>ANT is alpha local-first memory for AI coding agents.</span>
      <div>
        <a href="/docs/privacy">Privacy model</a>
        <a href="/docs/ranking">Ranking</a>
        <a href={githubUrl}>GitHub</a>
      </div>
    </footer>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="codeBlock">
      <code>{code}</code>
    </pre>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

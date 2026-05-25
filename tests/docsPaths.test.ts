import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const docsFiles = [
  "README.md",
  "website/src/main.tsx",
  "scripts/demo.ts",
  "scripts/e2e.ts"
];

const ignored = new Set([
  "error.log",
  "secret.log"
]);

const requiredDocumentedPaths = [
  "examples/logs/npm-nextjs.log",
  "examples/logs/python-django.log",
  "examples/logs/docker-build.log"
];
const realGithubUrl = "https://github.com/AntMemory/ANT";
const requiredFreshCloneCommands = ["npm ci", "npm run build", "npm run demo", "npm run test:e2e"];

test("documented example file paths exist", () => {
  const missing: string[] = [];
  const documented = new Set<string>();

  for (const file of docsFiles) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const examplePath of documentedPaths(content)) {
      documented.add(examplePath);
      if (ignored.has(examplePath)) {
        continue;
      }

      if (!fs.existsSync(path.join(repoRoot, examplePath))) {
        missing.push(`${file}: ${examplePath}`);
      }
    }
  }

  assert.deepEqual(missing, []);
  for (const requiredPath of requiredDocumentedPaths) {
    assert.equal(documented.has(requiredPath), true, `${requiredPath} must be documented`);
  }
});

test("public GitHub links point to the real repository", () => {
  const wrongLinks: string[] = [];

  for (const file of docsFiles) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const link of githubLinks(content)) {
      if (!link.startsWith(realGithubUrl)) {
        wrongLinks.push(`${file}: ${link}`);
      }
    }
  }

  assert.deepEqual(wrongLinks, []);
});

test("fresh clone quickstart commands stay accurate", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const website = fs.readFileSync(path.join(repoRoot, "website/src/main.tsx"), "utf8");

  for (const command of requiredFreshCloneCommands) {
    assert.match(readme, new RegExp(escapeRegExp(command)), `README must document ${command}`);
    assert.match(website, new RegExp(escapeRegExp(command)), `website must document ${command}`);
  }

  assert.doesNotMatch(readme, /npm install/, "README fresh clone docs should use npm ci");
  assert.doesNotMatch(website, /npm install/, "website fresh clone docs should use npm ci");
});

test("documented npm scripts exist in package.json", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  const staleCommands: string[] = [];

  for (const file of docsFiles) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const scriptName of npmRunScripts(content)) {
      if (!scripts[scriptName]) {
        staleCommands.push(`${file}: npm run ${scriptName}`);
      }
    }
  }

  assert.deepEqual(staleCommands, []);
});

function documentedPaths(content: string): string[] {
  const matches = content.matchAll(/(?:\.?[\\/])?(examples[\\/][A-Za-z0-9._/-]+|website[\\/][A-Za-z0-9._/-]+|scripts[\\/][A-Za-z0-9._/-]+)/g);
  return [...matches].map((match) => match[1].replace(/\\/g, "/"));
}

function githubLinks(content: string): string[] {
  return [...content.matchAll(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+[^\s)"']*/g)].map(
    (match) => match[0]
  );
}

function npmRunScripts(content: string): string[] {
  return [...content.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

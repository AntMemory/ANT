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

test("documented example file paths exist", () => {
  const missing: string[] = [];

  for (const file of docsFiles) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    for (const examplePath of documentedPaths(content)) {
      if (ignored.has(examplePath)) {
        continue;
      }

      if (!fs.existsSync(path.join(repoRoot, examplePath))) {
        missing.push(`${file}: ${examplePath}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

function documentedPaths(content: string): string[] {
  const matches = content.matchAll(/(?:\.?[\\/])?(examples[\\/][A-Za-z0-9._/-]+|website[\\/][A-Za-z0-9._/-]+|scripts[\\/][A-Za-z0-9._/-]+)/g);
  return [...matches].map((match) => match[1].replace(/\\/g, "/"));
}

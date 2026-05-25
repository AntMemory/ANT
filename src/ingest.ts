import path from "node:path";
import { redactText } from "./redact";
import type { MemoryContext, NewMemoryInput } from "./types";

export function memoryDraftFromLog(filePath: string, content: string): NewMemoryInput {
  const redacted = redactText(content);
  const lines = usefulLines(redacted.text);
  const signature = extractErrorSignature(lines);
  const context = detectContext(lines);
  const titleTail = signature ? `: ${truncate(signature, 80)}` : "";

  return {
    title: `Draft from log ${path.basename(filePath)}${titleTail}`,
    problem: lines.slice(0, 20).join("\n") || `Error log imported from ${path.basename(filePath)}.`,
    error_signature: signature,
    context,
    cause: "Draft memory: cause required before completion.",
    solution: {
      summary: "Draft memory: solution required before completion.",
      steps: ["Add the root cause", "Add the verified solution", "Add evidence before syncing or sharing"],
      commands: [],
      patch_example: ""
    },
    evidence: {
      verification_type: "draft: evidence required before completion",
      commands_run: []
    },
    privacy: {
      redacted: true,
      public_safe: false,
      redaction_warnings: [...redacted.warnings, "draft incomplete"].sort()
    }
  };
}

function usefulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function extractErrorSignature(lines: string[]): string {
  const patterns = [
    /\bTS\d{4}: .+/,
    /\bType error: .+/,
    /\b(?:TypeError|ReferenceError|SyntaxError|Error): .+/,
    /ModuleNotFoundError: .+/,
    /ImportError: .+/,
    /failed to solve: .+/i,
    /failed to (?:build|compile|compute cache key).+/i,
    /npm ERR! .+/,
    /ERROR: .+/
  ];

  for (const pattern of patterns) {
    const match = lines.map((line) => line.match(pattern)?.[0]).find(Boolean);
    if (match) {
      return truncate(match, 240);
    }
  }

  return truncate(lines[0] ?? "Unknown error", 240);
}

function detectContext(lines: string[]): MemoryContext {
  const text = lines.join("\n");
  const lower = text.toLowerCase();

  if (/\btraceback \(most recent call last\):/i.test(text) || /\.py\b/.test(text)) {
    return {
      language: "Python",
      framework: detectPythonFramework(lower),
      package_name: detectPythonPackage(text),
      package_version: "",
      runtime: detectPythonRuntime(text),
      os: "",
      tool: lower.includes("pytest") ? "pytest" : "python"
    };
  }

  if (/\bdocker\b/i.test(text) || /\bdockerfile\b/i.test(text) || /failed to solve:/i.test(text)) {
    return {
      language: "",
      framework: "Docker",
      package_name: detectDockerImage(text),
      package_version: "",
      runtime: "Docker",
      os: "",
      tool: "docker"
    };
  }

  return {
    language: detectJsLanguage(text),
    framework: detectJsFramework(lower),
    package_name: detectJsPackage(lower),
    package_version: detectPackageVersion(text),
    runtime: detectNodeRuntime(text),
    os: "",
    tool: lower.includes("pnpm") ? "pnpm" : lower.includes("yarn") ? "yarn" : "npm"
  };
}

function detectJsLanguage(text: string): string {
  if (/\btsc\b|\.tsx?\b|\btypescript\b|\bTS\d{4}\b/i.test(text)) {
    return "TypeScript";
  }

  return "JavaScript";
}

function detectJsFramework(lower: string): string {
  if (lower.includes("next.js") || lower.includes("nextjs") || lower.includes("next build")) {
    return "Next.js";
  }

  if (lower.includes("vite")) {
    return "Vite";
  }

  if (lower.includes("react")) {
    return "React";
  }

  return "";
}

function detectJsPackage(lower: string): string {
  if (lower.includes(" next@") || lower.includes("next build") || lower.includes("next.js")) {
    return "next";
  }

  if (lower.includes(" prisma") || lower.includes("prisma")) {
    return "prisma";
  }

  return "";
}

function detectPackageVersion(text: string): string {
  return (
    text.match(/\b(?:next|prisma|react|vite)@(\d+(?:\.\d+){0,2})\b/i)?.[1] ??
    text.match(/\bNext\.js\s+(\d+(?:\.\d+){0,2})\b/i)?.[1] ??
    ""
  );
}

function detectNodeRuntime(text: string): string {
  const version = text.match(/\bnode(?:\.js)?\s+v?(\d+(?:\.\d+){0,2})\b/i)?.[1];
  return version ? `Node ${version}` : "Node";
}

function detectPythonFramework(lower: string): string {
  if (lower.includes("django")) {
    return "Django";
  }

  if (lower.includes("fastapi")) {
    return "FastAPI";
  }

  if (lower.includes("pytest")) {
    return "pytest";
  }

  return "";
}

function detectPythonPackage(text: string): string {
  return (
    text.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/)?.[1] ??
    text.match(/ImportError: .*['"]([^'"]+)['"]/)?.[1] ??
    ""
  );
}

function detectPythonRuntime(text: string): string {
  const version = text.match(/\bPython\s+(\d+(?:\.\d+){1,2})\b/i)?.[1];
  return version ? `Python ${version}` : "Python";
}

function detectDockerImage(text: string): string {
  return text.match(/^FROM\s+([^\s]+)\b/im)?.[1] ?? "";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

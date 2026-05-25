import path from "node:path";
import type { NewMemoryInput } from "./types";

type JsonObject = Record<string, unknown>;

export function memoryFromJson(value: unknown): NewMemoryInput {
  if (!isObject(value)) {
    throw new Error("memory JSON must be an object");
  }

  const context = isObject(value.context) ? value.context : {};
  const solution = isObject(value.solution) ? value.solution : {};
  const evidence = isObject(value.evidence) ? value.evidence : {};
  const privacy = isObject(value.privacy) ? value.privacy : {};

  return {
    title: asString(value.title),
    problem: asString(value.problem),
    error_signature: asString(value.error_signature),
    context: {
      language: asString(context.language),
      framework: asString(context.framework),
      package_name: asString(context.package_name),
      package_version: asString(context.package_version),
      runtime: asString(context.runtime),
      os: asString(context.os),
      tool: asString(context.tool)
    },
    cause: asString(value.cause),
    solution: {
      summary: asString(solution.summary),
      steps: asStringArray(solution.steps),
      commands: asStringArray(solution.commands),
      patch_example: asString(solution.patch_example)
    },
    evidence: {
      verification_type: asString(evidence.verification_type),
      commands_run: asStringArray(evidence.commands_run)
    },
    privacy: {
      redacted: asBoolean(privacy.redacted, true),
      public_safe: asBoolean(privacy.public_safe, false),
      redaction_warnings: asStringArray(privacy.redaction_warnings)
    }
  };
}

export function memoryFromLog(filePath: string, content: string): NewMemoryInput {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "Imported error log";
  const excerpt = lines.slice(0, 12).join("\n");

  return {
    title: `Imported error log: ${path.basename(filePath)}`,
    problem: excerpt || `Error log imported from ${filePath}.`,
    error_signature: firstLine,
    context: {
      language: "",
      framework: "",
      package_name: "",
      package_version: "",
      runtime: "",
      os: process.platform,
      tool: "ant"
    },
    cause: "Imported from an error log; root cause was not provided.",
    solution: {
      summary: "Imported error log for follow-up; solution was not provided.",
      steps: ["Review the imported error signature", "Record the final fix with ant remember --json"],
      commands: [],
      patch_example: ""
    },
    evidence: {
      verification_type: "error log",
      commands_run: []
    },
    privacy: {
      redacted: false,
      public_safe: false,
      redaction_warnings: []
    }
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

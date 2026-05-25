import { randomUUID } from "node:crypto";
import type { Memory, NewMemoryInput } from "./types";
import { redactMemory } from "./redact";

const requiredContextKeys = [
  "language",
  "framework",
  "package_name",
  "package_version",
  "runtime",
  "os",
  "tool"
] as const;

export function createMemory(input: NewMemoryInput): Memory {
  const redactedInput = redactMemory(input);
  validateNewMemory(redactedInput);
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    ...redactedInput,
    created_at: now,
    updated_at: now
  };
}

export function validateNewMemory(input: NewMemoryInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("memory must be an object");
  }

  requireText(input.title, "title");
  requireText(input.problem, "problem");
  requireText(input.cause, "cause");
  if (!input.solution || typeof input.solution !== "object") {
    throw new Error("solution is required");
  }
  requireText(input.solution.summary, "solution.summary");

  for (const key of requiredContextKeys) {
    requireDefinedString(input.context[key], `context.${key}`);
  }

  requireDefinedString(input.error_signature, "error_signature");
  requireStringArray(input.solution.steps, "solution.steps");
  requireStringArray(input.solution.commands, "solution.commands");
  requireDefinedString(input.solution.patch_example, "solution.patch_example");
  requireDefinedString(input.evidence.verification_type, "evidence.verification_type");
  requireStringArray(input.evidence.commands_run, "evidence.commands_run");

  if (typeof input.privacy.redacted !== "boolean") {
    throw new Error("privacy.redacted must be a boolean");
  }

  if (typeof input.privacy.public_safe !== "boolean") {
    throw new Error("privacy.public_safe must be a boolean");
  }

  requireStringArray(input.privacy.redaction_warnings, "privacy.redaction_warnings");
}

function requireText(value: string, path: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} is required`);
  }
}

function requireDefinedString(value: string, path: string): void {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
}

function requireStringArray(value: string[], path: string): void {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${path} must be an array of strings`);
  }
}

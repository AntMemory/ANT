import os from "node:os";
import path from "node:path";
import type { NewMemoryInput } from "./types";

export type RedactionResult = {
  text: string;
  redacted: boolean;
  warnings: string[];
};

type Rule = {
  label: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
};

const userName = os.userInfo().username;
const homeDir = os.homedir();

export function redactText(text: string, cwd = process.cwd()): RedactionResult {
  const warnings = new Set<string>();
  let redactedText = redactLocalPaths(text, warnings);

  for (const rule of rules(cwd)) {
    redactedText = redactedText.replace(rule.pattern, (...args) => {
      warnings.add(rule.label);
      if (typeof rule.replacement === "function") {
        return rule.replacement(args[0], ...args.slice(1, -2));
      }

      return rule.replacement;
    });
  }

  redactedText = redactHighEntropyTokens(redactedText, warnings);

  return {
    text: redactedText,
    redacted: redactedText !== text,
    warnings: [...warnings].sort()
  };
}

export function redactMemory(input: NewMemoryInput, cwd = process.cwd()): NewMemoryInput {
  const warnings = new Set(input.privacy.redaction_warnings ?? []);
  let changed = false;

  const redactField = (value: string): string => {
    const result = redactText(value, cwd);
    changed ||= result.redacted;
    for (const warning of result.warnings) {
      warnings.add(warning);
    }

    return result.text;
  };

  const redacted: NewMemoryInput = {
    ...input,
    problem: redactField(input.problem),
    error_signature: redactField(input.error_signature),
    cause: redactField(input.cause),
    solution: {
      summary: redactField(input.solution.summary),
      steps: input.solution.steps.map(redactField),
      commands: input.solution.commands.map(redactField),
      patch_example: redactField(input.solution.patch_example)
    },
    privacy: {
      redacted: true,
      public_safe: warnings.size === 0,
      redaction_warnings: [...warnings].sort()
    }
  };

  if (!changed && warnings.size === 0) {
    redacted.privacy.public_safe = input.privacy.public_safe;
  }

  return redacted;
}

function rules(cwd: string): Rule[] {
  const projectName = path.basename(cwd);
  const projectPattern = safeLiteralPattern(projectName);
  const userPattern = safeLiteralPattern(userName);

  return [
    {
      label: "private key redacted",
      pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      replacement: "[REDACTED_PRIVATE_KEY]"
    },
    {
      label: "database URL redacted",
      pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s'"`<>]+/gi,
      replacement: "[REDACTED_DATABASE_URL]"
    },
    {
      label: "API key redacted",
      pattern: /\b(?:sk|pk|rk|xox[baprs]|gh[pousr]|glpat|AKIA|ASIA)[A-Za-z0-9_\-]{16,}\b/g,
      replacement: "[REDACTED_API_KEY]"
    },
    {
      label: "token redacted",
      pattern:
        /\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*['"]?([^'"\s;]{8,})['"]?/gi,
      replacement: (match, secret) => match.replace(secret, "[REDACTED_TOKEN]")
    },
    {
      label: "password redacted",
      pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?([^'"\s;]{3,})['"]?/gi,
      replacement: (match, secret) => match.replace(secret, "[REDACTED_PASSWORD]")
    },
    {
      label: ".env value redacted",
      pattern: /^([A-Z][A-Z0-9_]{2,}\s*=\s*)(.+)$/gm,
      replacement: (_match, prefix) => `${prefix}[REDACTED_ENV_VALUE]`
    },
    {
      label: "email redacted",
      pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      replacement: "[REDACTED_EMAIL]"
    },
    {
      label: "username redacted",
      pattern: userPattern ? new RegExp(`\\b${userPattern}\\b`, "gi") : /$^/,
      replacement: "[REDACTED_USER]"
    },
    {
      label: "project name redacted",
      pattern:
        projectPattern && projectName.length > 3
          ? new RegExp(`\\b${projectPattern}\\b`, "gi")
          : /$^/,
      replacement: "[REDACTED_PROJECT]"
    }
  ];
}

function redactLocalPaths(text: string, warnings: Set<string>): string {
  const pathPattern =
    /(?:[A-Z]:\\Users\\[^'"\s<>]+|\/Users\/[^'"\s<>]+|\/home\/[^'"\s<>]+)/gi;

  return text.replace(pathPattern, (match) => {
    warnings.add("local path redacted");
    return `[REDACTED_PATH]${pathTail(match)}`;
  });
}

function pathTail(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const anchor = parts.findIndex((part) => {
    return /^(src|app|pages|components|lib|server|client|test|tests|scripts|dist|build)$/i.test(part);
  });

  if (anchor !== -1) {
    return `/${parts.slice(anchor).join("/")}`;
  }

  const tail = parts.slice(-2).join("/");
  return tail ? `/${tail}` : "";
}

function redactHighEntropyTokens(text: string, warnings: Set<string>): string {
  return text.replace(/\b[A-Za-z0-9_\-+/=]{24,}\b/g, (token) => {
    if (looksHighEntropy(token)) {
      warnings.add("high entropy secret redacted");
      return "[REDACTED_SECRET]";
    }

    return token;
  });
}

function looksHighEntropy(token: string): boolean {
  const hasLower = /[a-z]/.test(token);
  const hasUpper = /[A-Z]/.test(token);
  const hasDigit = /\d/.test(token);
  const hasSymbol = /[_\-+/=]/.test(token);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  return variety >= 3 && uniqueRatio(token) > 0.45;
}

function uniqueRatio(value: string): number {
  return new Set(value.split("")).size / value.length;
}

function safeLiteralPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

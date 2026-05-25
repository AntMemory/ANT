import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemory } from "../src/schema";

test("createMemory enforces required solved-issue fields", () => {
  assert.throws(
    () =>
      createMemory({
        title: "",
        problem: "A problem",
        error_signature: "",
        context: {
          language: "",
          framework: "",
          package_name: "",
          package_version: "",
          runtime: "",
          os: "",
          tool: ""
        },
        cause: "A cause",
        solution: {
          summary: "A fix",
          steps: [],
          commands: [],
          patch_example: ""
        },
        evidence: {
          verification_type: "",
          commands_run: []
        },
        privacy: {
          redacted: true,
          public_safe: false,
          redaction_warnings: []
        }
      }),
    /title is required/
  );
});

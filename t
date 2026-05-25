warning: in the working copy of 'README.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/redact.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'tests/cloud.test.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'tests/redact.test.ts', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/README.md b/README.md[m
[1mindex e3efc98..e2b698b 100644[m
[1m--- a/README.md[m
[1m+++ b/README.md[m
[36m@@ -183,15 +183,25 @@[m [mMCP tools:[m
 [m
 ANT runs deterministic local redaction before saving sensitive memory fields:[m
 [m
[32m+[m[32m- `title`[m
 - `problem`[m
 - `error_signature`[m
[32m+[m[32m- `context.language`[m
[32m+[m[32m- `context.framework`[m
[32m+[m[32m- `context.package_name`[m
[32m+[m[32m- `context.package_version`[m
[32m+[m[32m- `context.runtime`[m
[32m+[m[32m- `context.os`[m
[32m+[m[32m- `context.tool`[m
 - `cause`[m
 - `solution.summary`[m
 - `solution.steps`[m
 - `solution.commands`[m
 - `solution.patch_example`[m
[32m+[m[32m- `evidence.verification_type`[m
[32m+[m[32m- `evidence.commands_run`[m
 [m
[31m-The redactor uses regex and simple entropy checks. It does not use an LLM.[m
[32m+[m[32mThe redactor uses regex and simple entropy checks. It does not use an LLM, and it cannot guarantee that every private identifier or novel secret format will be caught.[m
 [m
 Current checks cover:[m
 [m
[36m@@ -216,6 +226,8 @@[m [mprivacy: {[m
 [m
 `ant inspect-pending` shows memories where `public_safe` is false.[m
 [m
[32m+[m[32mCloud sync refuses memories that are not public-safe and also blocks memories carrying high-severity redaction warnings such as API keys, tokens, passwords, private keys, `.env` values, database URLs, or high-entropy secrets.[m
[32m+[m
 ## Cloud Sync Alpha[m
 [m
 Cloud sync is an alpha feature for sharing redacted, public-safe memories across machines.[m
[36m@@ -297,6 +309,8 @@[m [mnpm run test:e2e[m
 ## Current Limitations[m
 [m
 - Redaction is deterministic and conservative, not semantic.[m
[32m+[m[32m- Redaction can miss unusual secret formats, business-specific identifiers, or private terms that do not match the current rules.[m
[32m+[m[32m- Public-safe metadata is a local safety signal, not a formal security review.[m
 - Cloud sync alpha has no authentication or authorization model yet.[m
 - No dashboard.[m
 - No payments or team management.[m
[1mdiff --git a/src/redact.ts b/src/redact.ts[m
[1mindex 693f0c7..9c40c30 100644[m
[1m--- a/src/redact.ts[m
[1m+++ b/src/redact.ts[m
[36m@@ -57,8 +57,18 @@[m [mexport function redactMemory(input: NewMemoryInput, cwd = process.cwd()): NewMem[m
 [m
   const redacted: NewMemoryInput = {[m
     ...input,[m
[32m+[m[32m    title: redactField(input.title),[m
     problem: redactField(input.problem),[m
     error_signature: redactField(input.error_signature),[m
[32m+[m[32m    context: {[m
[32m+[m[32m      language: redactField(input.context.language),[m
[32m+[m[32m      framework: redactField(input.context.framework),[m
[32m+[m[32m      package_name: redactField(input.context.package_name),[m
[32m+[m[32m      package_version: redactField(input.context.package_version),[m
[32m+[m[32m      runtime: redactField(input.context.runtime),[m
[32m+[m[32m      os: redactField(input.context.os),[m
[32m+[m[32m      tool: redactField(input.context.tool)[m
[32m+[m[32m    },[m
     cause: redactField(input.cause),[m
     solution: {[m
       summary: redactField(input.solution.summary),[m
[36m@@ -66,6 +76,10 @@[m [mexport function redactMemory(input: NewMemoryInput, cwd = process.cwd()): NewMem[m
       commands: input.solution.commands.map(redactField),[m
       patch_example: redactField(input.solution.patch_example)[m
     },[m
[32m+[m[32m    evidence: {[m
[32m+[m[32m      verification_type: redactField(input.evidence.verification_type),[m
[32m+[m[32m      commands_run: input.evidence.commands_run.map(redactField)[m
[32m+[m[32m    },[m
     privacy: {[m
       redacted: true,[m
       public_safe: warnings.size === 0,[m
[36m@@ -84,6 +98,21 @@[m [mfunction rules(cwd: string): Rule[] {[m
   const projectName = path.basename(cwd);[m
   const projectPattern = safeLiteralPattern(projectName);[m
   const userPattern = safeLiteralPattern(userName);[m
[32m+[m[32m  const optionalRules: Rule[] = [];[m
[32m+[m[32m  if (userPattern) {[m
[32m+[m[32m    optionalRules.push({[m
[32m+[m[32m      label: "username redacted",[m
[32m+[m[32m      pattern: new RegExp(`\\b${userPattern}\\b`, "gi"),[m
[32m+[m[32m      replacement: "[REDACTED_USER]"[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m[32m  if (projectPattern && projectName.length > 3) {[m
[32m+[m[32m    optionalRules.push({[m
[32m+[m[32m      label: "project name redacted",[m
[32m+[m[32m      pattern: new RegExp(`\\b${projectPattern}\\b`, "gi"),[m
[32m+[m[32m      replacement: "[REDACTED_PROJECT]"[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
 [m
   return [[m
     {[m
[36m@@ -122,19 +151,7 @@[m [mfunction rules(cwd: string): Rule[] {[m
       pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,[m
       replacement: "[REDACTED_EMAIL]"[m
     },[m
[31m-    {[m
[31m-      label: "username redacted",[m
[31m-      pattern: userPattern ? new RegExp(`\\b${userPattern}\\b`, "gi") : /$^/,[m
[31m-      replacement: "[REDACTED_USER]"[m
[31m-    },[m
[31m-    {[m
[31m-      label: "project name redacted",[m
[31m-      pattern:[m
[31m-        projectPattern && projectName.length > 3[m
[31m-          ? new RegExp(`\\b${projectPattern}\\b`, "gi")[m
[31m-          : /$^/,[m
[31m-      replacement: "[REDACTED_PROJECT]"[m
[31m-    }[m
[32m+[m[32m    ...optionalRules[m
   ];[m
 }[m
 [m
[1mdiff --git a/tests/cloud.test.ts b/tests/cloud.test.ts[m
[1mindex 1548a93..eee9b73 100644[m
[1m--- a/tests/cloud.test.ts[m
[1m+++ b/tests/cloud.test.ts[m
[36m@@ -56,6 +56,22 @@[m [mtest("unsafe memory is rejected", async () => {[m
   assert.match(response.body.error, /not public-safe|high-severity/);[m
 });[m
 [m
[32m+[m[32mtest("high-severity redaction warnings block public sync", async () => {[m
[32m+[m[32m  const memory = {[m
[32m+[m[32m    ...createMemory(safeMemory("High warning memory")),[m
[32m+[m[32m    privacy: {[m
[32m+[m[32m      redacted: true,[m
[32m+[m[32m      public_safe: true,[m
[32m+[m[32m      redaction_warnings: ["API key redacted"][m
[32m+[m[32m    }[m
[32m+[m[32m  };[m
[32m+[m
[32m+[m[32m  const response = await postJson("/memories", memory);[m
[32m+[m
[32m+[m[32m  assert.equal(response.status, 400);[m
[32m+[m[32m  assert.match(response.body.error, /not public-safe|high-severity/);[m
[32m+[m[32m});[m
[32m+[m
 test("global search returns synced memory", async () => {[m
   const memory = createMemory(safeMemory("Next.js params cloud memory"));[m
   await postJson("/memories", memory);[m
[1mdiff --git a/tests/redact.test.ts b/tests/redact.test.ts[m
[1mindex 123915c..2c84b09 100644[m
[1m--- a/tests/redact.test.ts[m
[1m+++ b/tests/redact.test.ts[m
[36m@@ -91,6 +91,25 @@[m [mtest("createMemory redacts sensitive memory fields before storage", async () =>[m
   assert.ok(stored.privacy.redaction_warnings.length > 0);[m
 });[m
 [m
[32m+[m[32mtest("createMemory redacts secrets across every memory field", () => {[m
[32m+[m[32m  const memory = createMemory(secretInEveryMemoryField());[m
[32m+[m[32m  const serialized = JSON.stringify(memory);[m
[32m+[m
[32m+[m[32m  for (const secret of everyFieldSecrets()) {[m
[32m+[m[32m    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secret)), `Leaked secret: ${secret}`);[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  assert.equal(memory.title.includes("[REDACTED_API_KEY]"), true);[m
[32m+[m[32m  assert.equal(memory.context.language, "[REDACTED_EMAIL]");[m
[32m+[m[32m  assert.equal(memory.privacy.redacted, true);[m
[32m+[m[32m  assert.equal(memory.privacy.public_safe, false);[m
[32m+[m[32m  assert.ok(memory.privacy.redaction_warnings.includes("API key redacted"));[m
[32m+[m[32m  assert.ok(memory.privacy.redaction_warnings.includes("database URL redacted"));[m
[32m+[m[32m  assert.ok(memory.privacy.redaction_warnings.includes("email redacted"));[m
[32m+[m[32m  assert.ok(memory.privacy.redaction_warnings.includes("token redacted"));[m
[32m+[m[32m  assert.ok(memory.privacy.redaction_warnings.includes("password redacted"));[m
[32m+[m[32m});[m
[32m+[m
 test("ant redact prints redacted file content and warnings", () => {[m
   const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-redact-cli-"));[m
   const filePath = path.join(cwd, "error.log");[m
[36m@@ -152,6 +171,81 @@[m [mfunction secretMemory(): NewMemoryInput {[m
   };[m
 }[m
 [m
[32m+[m[32mfunction secretInEveryMemoryField(): NewMemoryInput {[m
[32m+[m[32m  const [[m
[32m+[m[32m    titleKey,[m
[32m+[m[32m    problemEmail,[m
[32m+[m[32m    errorPassword,[m
[32m+[m[32m    contextEmail,[m
[32m+[m[32m    contextToken,[m
[32m+[m[32m    contextDb,[m
[32m+[m[32m    contextPassword,[m
[32m+[m[32m    contextKey,[m
[32m+[m[32m    contextEnv,[m
[32m+[m[32m    contextBearer,[m
[32m+[m[32m    causeDb,[m
[32m+[m[32m    summaryToken,[m
[32m+[m[32m    stepKey,[m
[32m+[m[32m    commandPassword,[m
[32m+[m[32m    patchPrivateKey,[m
[32m+[m[32m    evidenceEmail,[m
[32m+[m[32m    evidenceEnv[m
[32m+[m[32m  ] = everyFieldSecrets();[m
[32m+[m
[32m+[m[32m  return {[m
[32m+[m[32m    title: `Build failed with ${titleKey}`,[m
[32m+[m[32m    problem: `Problem reported by ${problemEmail}`,[m
[32m+[m[32m    error_signature: `Error contained password=${errorPassword}`,[m
[32m+[m[32m    context: {[m
[32m+[m[32m      language: contextEmail,[m
[32m+[m[32m      framework: `token=${contextToken}`,[m
[32m+[m[32m      package_name: contextDb,[m
[32m+[m[32m      package_version: `password=${contextPassword}`,[m
[32m+[m[32m      runtime: contextKey,[m
[32m+[m[32m      os: `NPM_TOKEN=${contextEnv}`,[m
[32m+[m[32m      tool: `bearer=${contextBearer}`[m
[32m+[m[32m    },[m
[32m+[m[32m    cause: `Cause used ${causeDb}`,[m
[32m+[m[32m    solution: {[m
[32m+[m[32m      summary: `Rotate token=${summaryToken}`,[m
[32m+[m[32m      steps: [`Remove ${stepKey}`],[m
[32m+[m[32m      commands: [`PASSWORD=${commandPassword} npm test`],[m
[32m+[m[32m      patch_example: patchPrivateKey[m
[32m+[m[32m    },[m
[32m+[m[32m    evidence: {[m
[32m+[m[32m      verification_type: `checked by ${evidenceEmail}`,[m
[32m+[m[32m      commands_run: [`API_KEY=${evidenceEnv} npm run build`][m
[32m+[m[32m    },[m
[32m+[m[32m    privacy: {[m
[32m+[m[32m      redacted: false,[m
[32m+[m[32m      public_safe: true,[m
[32m+[m[32m      redaction_warnings: [][m
[32m+[m[32m    }[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction everyFieldSecrets(): string[] {[m
[32m+[m[32m  return [[m
[32m+[m[32m    "sk-title1234567890abcdefABCDEF123456",[m
[32m+[m[32m    "problem@example.com",[m
[32m+[m[32m    "field-password-secret",[m
[32m+[m[32m    "context-language@example.com",[m
[32m+[m[32m    "ctxTOKEN1234567890abcdefABCDEF",[m
[32m+[m[32m    "postgres://ctx:secret@localhost:5432/app",[m
[32m+[m[32m    "ctx-password-secret",[m
[32m+[m[32m    "sk-runtime1234567890abcdefABCDEF123456",[m
[32m+[m[32m    "envSECRET1234567890abcdefABCDEF",[m
[32m+[m[32m    "bearerSECRET1234567890abcdefABCDEF",[m
[32m+[m[32m    "mysql://cause:secret@localhost:3306/app",[m
[32m+[m[32m    "summaryTOKEN1234567890abcdefABCDEF",[m
[32m+[m[32m    "ghp_step1234567890abcdefABCDEF123456",[m
[32m+[m[32m    "command-password-secret",[m
[32m+[m[32m    "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",[m
[32m+[m[32m    "evidence@example.com",[m
[32m+[m[32m    "evidenceSECRET1234567890abcdefABCDEF"[m
[32m+[m[32m  ];[m
[32m+[m[32m}[m
[32m+[m
 function runCli(args: string[], cwd: string): ReturnType<typeof spawnSync> {[m
   return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {[m
     cwd,[m

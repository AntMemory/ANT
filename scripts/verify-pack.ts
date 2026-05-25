import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ant-pack-"));
const packDir = path.join(tempRoot, "pack");
const unpackDir = path.join(tempRoot, "unpack");
const runDir = path.join(tempRoot, "run");
const npmCacheDir = path.join(tempRoot, "npm-cache");

fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(unpackDir, { recursive: true });
fs.mkdirSync(runDir, { recursive: true });

runNpm(["pack", "--dry-run"], repoRoot);
const packed = runNpm(["pack", "--pack-destination", packDir], repoRoot);
const tarballName = packed.stdout
  .trim()
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .at(-1);

assert.ok(tarballName, `npm pack did not print a tarball name:\n${packed.stdout}`);
const tarballPath = path.join(packDir, tarballName);
assert.equal(fs.existsSync(tarballPath), true, `Packed tarball not found: ${tarballPath}`);

run("tar", ["-xzf", tarballPath, "-C", unpackDir], repoRoot);
const packageRoot = path.join(unpackDir, "package");

for (const file of ["dist/cli.js", "dist/mcp.js", "dist/cloud.js", "README.md", "LICENSE", "package.json"]) {
  assert.equal(fs.existsSync(path.join(packageRoot, file)), true, `Packed package is missing ${file}`);
}

for (const excluded of ["tests", "scripts", "website", ".ant", ".ant-cloud"]) {
  assert.equal(fs.existsSync(path.join(packageRoot, excluded)), false, `Packed package should not include ${excluded}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  bin?: Record<string, string>;
};

for (const [name, binPath] of Object.entries(packageJson.bin ?? {})) {
  assert.equal(fs.existsSync(path.join(packageRoot, binPath)), true, `bin ${name} points to missing file ${binPath}`);
}

const runtimeEnv = { NODE_PATH: path.join(repoRoot, "node_modules") };
const help = run(process.execPath, [path.join(packageRoot, "dist", "cli.js")], runDir, runtimeEnv);
assert.match(help.stdout, /ANT v0/);

const init = run(process.execPath, [path.join(packageRoot, "dist", "cli.js"), "init"], runDir, runtimeEnv);
assert.match(init.stdout, /ANT database ready/);
assert.equal(fs.existsSync(path.join(runDir, ".ant", "memory.sqlite")), true);

console.log(`Packed package verified: ${tarballPath}`);

function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {}
): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.error ? `error:\n${result.error.message}\n` : ""}stdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
  }

  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runNpm(args: string[], cwd: string): { stdout: string; stderr: string } {
  const env = { npm_config_cache: npmCacheDir };
  const npmCli = process.env.npm_execpath;
  if (npmCli) {
    return run(process.execPath, [npmCli, ...args], cwd, env);
  }

  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd, env);
}

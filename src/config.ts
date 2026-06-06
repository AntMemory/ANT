import fs from "node:fs";
import path from "node:path";

export type AntConfig = {
  auto_search_global: boolean;
  auto_publish: boolean;
};

export const defaultConfig: AntConfig = {
  auto_search_global: false,
  auto_publish: false
};

export const configKeys = Object.keys(defaultConfig) as Array<keyof AntConfig>;

export function defaultConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, ".ant", "config.json");
}

export function loadConfig(cwd = process.cwd()): AntConfig {
  const filePath = defaultConfigPath(cwd);
  if (!fs.existsSync(filePath)) {
    return { ...defaultConfig };
  }

  const parsed = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8"))) as Partial<Record<keyof AntConfig, unknown>>;
  return {
    auto_search_global: asBoolean(parsed.auto_search_global, defaultConfig.auto_search_global),
    auto_publish: asBoolean(parsed.auto_publish, defaultConfig.auto_publish)
  };
}

export function saveConfig(config: AntConfig, cwd = process.cwd()): void {
  const filePath = defaultConfigPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

export function setConfigValue(key: string, value: string, cwd = process.cwd()): AntConfig {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${configKeys.join(", ")}`);
  }

  const config = loadConfig(cwd);
  config[key] = parseBoolean(value);
  saveConfig(config, cwd);
  return config;
}

function isConfigKey(key: string): key is keyof AntConfig {
  return configKeys.includes(key as keyof AntConfig);
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected boolean value, got "${value}"`);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

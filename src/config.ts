import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { AppConfig, PrinterConfig } from "./types.js";

const CONFIG_DIR =
  process.env.BAMBU_MCP_CONFIG_DIR || path.join(os.homedir(), ".bambu-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "printers.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): AppConfig {
  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { printers: [] };
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function addPrinterToConfig(printer: PrinterConfig): void {
  const config = loadConfig();
  const existing = config.printers.findIndex((p) => p.id === printer.id);
  if (existing >= 0) {
    config.printers[existing] = printer;
  } else {
    config.printers.push(printer);
  }
  saveConfig(config);
}

export function removePrinterFromConfig(id: string): boolean {
  const config = loadConfig();
  const idx = config.printers.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  config.printers.splice(idx, 1);
  saveConfig(config);
  return true;
}

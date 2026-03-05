#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FleetManager } from "./fleet-manager.js";
import { loadConfig } from "./config.js";
import { registerManagementTools } from "./tools/management.js";
import { registerStatusTools } from "./tools/status.js";
import { registerPrintControlTools } from "./tools/print-control.js";
import { registerHardwareTools } from "./tools/hardware.js";
import { registerFileTools } from "./tools/files.js";
import { registerCameraTools } from "./tools/camera.js";
import { registerAmsTools } from "./tools/ams.js";
import { registerGcodeTools } from "./tools/gcode.js";
import { registerSigningTools } from "./tools/signing.js";

const server = new McpServer({
  name: "bambu-farm",
  version: "1.0.0",
});

const fleet = new FleetManager();

// Register all tools
registerManagementTools(server, fleet);
registerStatusTools(server, fleet);
registerPrintControlTools(server, fleet);
registerHardwareTools(server, fleet);
registerFileTools(server, fleet);
registerCameraTools(server, fleet);
registerAmsTools(server, fleet);
registerGcodeTools(server, fleet);
registerSigningTools(server);

// Connect to all configured printers on startup
async function connectConfiguredPrinters(): Promise<void> {
  const config = loadConfig();
  if (config.printers.length === 0) {
    console.error(
      "No printers configured. Use the add_printer tool to add one.",
    );
    return;
  }

  console.error(`Found ${config.printers.length} configured printer(s).`);

  const results = await Promise.allSettled(
    config.printers.map(async (printer) => {
      try {
        await fleet.connectPrinter(printer);
        console.error(`Connected to ${printer.name} (${printer.id}).`);
      } catch (err: any) {
        console.error(
          `Failed to connect to ${printer.name} (${printer.id}): ${err.message}`,
        );
      }
    }),
  );

  const connected = results.filter((r) => r.status === "fulfilled").length;
  console.error(
    `${connected}/${config.printers.length} printer(s) connected.`,
  );
}

async function main(): Promise<void> {
  // Connect to printers first (non-blocking — server starts even if connections fail)
  await connectConfiguredPrinters();

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bambu Farm MCP server running on stdio.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

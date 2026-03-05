import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";
import {
  addPrinterToConfig,
  removePrinterFromConfig,
  loadConfig,
  getConfigPath,
} from "../config.js";
import type { PrinterConfig } from "../types.js";

const PRINTER_ID_PARAM = z
  .string()
  .describe(
    "Printer ID to target, or 'all' for all printers. Omit if only one printer is configured.",
  );

export function registerManagementTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "add_printer",
    "Add a Bambu Lab printer to the fleet. Saves config and connects via MQTT.",
    {
      id: z
        .string()
        .describe("Unique ID/alias for this printer (e.g. 'my-p1s', 'mini-1')"),
      name: z
        .string()
        .describe("Friendly display name (e.g. 'Workshop P1S')"),
      host: z.string().describe("Printer IP address (e.g. '192.168.1.100')"),
      access_code: z
        .string()
        .describe("8-character access code from printer LCD (WLAN settings)"),
      serial_number: z
        .string()
        .describe("Printer serial number from Settings > Device"),
      model: z
        .string()
        .optional()
        .describe(
          "Printer model (e.g. 'A1 Mini', 'P1S', 'X1C', 'H2D'). Optional but helps tailor features.",
        ),
    },
    async ({ id, name, host, access_code, serial_number, model }) => {
      const config: PrinterConfig = {
        id,
        name,
        host,
        accessCode: access_code,
        serialNumber: serial_number,
        model,
      };

      try {
        await fleet.connectPrinter(config);
        addPrinterToConfig(config);
        return {
          content: [
            {
              type: "text" as const,
              text: `Printer '${name}' (${id}) added and connected successfully at ${host}.`,
            },
          ],
        };
      } catch (err: any) {
        // Save config even if connection fails — user can retry later
        addPrinterToConfig(config);
        return {
          content: [
            {
              type: "text" as const,
              text: `Printer '${name}' (${id}) saved to config but connection failed: ${err.message}. It will retry on next server restart.`,
            },
          ],
        };
      }
    },
  );

  server.tool(
    "remove_printer",
    "Remove a printer from the fleet. Disconnects MQTT and removes from config.",
    {
      id: z.string().describe("ID of the printer to remove"),
    },
    async ({ id }) => {
      fleet.disconnectPrinter(id);
      const removed = removePrinterFromConfig(id);
      if (removed) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Printer '${id}' removed and disconnected.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Printer '${id}' not found in config.`,
          },
        ],
      };
    },
  );

  server.tool(
    "reconnect_printer",
    "Reconnect a printer (or all printers) by re-reading config and re-establishing MQTT connections.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for all printers"),
    },
    async ({ printer }) => {
      const config = loadConfig();
      const targets = printer && printer !== "all"
        ? config.printers.filter((p) => p.id === printer)
        : config.printers;

      if (targets.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: printer
                ? `Printer '${printer}' not found in config.`
                : "No printers configured.",
            },
          ],
        };
      }

      const results = await Promise.allSettled(
        targets.map(async (p) => {
          await fleet.connectPrinter(p);
          return `[${p.name}] Reconnected successfully.`;
        }),
      );

      const text = results
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : `[${targets[i].name}] Failed: ${(r as PromiseRejectedResult).reason?.message || r.reason}`,
        )
        .join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "list_printers",
    "List all configured printers with their connection status.",
    {},
    async () => {
      const config = loadConfig();
      if (config.printers.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No printers configured. Use add_printer to add one.\nConfig file: ${getConfigPath()}`,
            },
          ],
        };
      }

      const lines = ["# Configured Printers\n"];
      for (const p of config.printers) {
        const conn = fleet.getPrinter(p.id);
        const status = conn?.mqtt.isConnected() ? "Connected" : "Disconnected";
        lines.push(`## ${p.name} (\`${p.id}\`)`);
        lines.push(`- **Host:** ${p.host}`);
        lines.push(`- **Serial:** ${p.serialNumber}`);
        lines.push(`- **Model:** ${p.model || "Unknown"}`);
        lines.push(`- **Status:** ${status}`);
        lines.push("");
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );
}

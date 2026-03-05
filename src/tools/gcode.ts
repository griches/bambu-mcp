import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";

const BLOCKED_GCODE_PREFIXES = [
  "M112", // Emergency stop
  "M502", // Factory reset
  "M500", // Save settings to EEPROM
  "M501", // Load settings from EEPROM
  "M997", // Firmware update
  "M999", // Restart
];

export function registerGcodeTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "send_gcode",
    "Send a raw G-code command to a printer (or all printers). Some dangerous commands are blocked for safety.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      command: z
        .string()
        .describe(
          "G-code command to send (e.g. 'G28' for home, 'M106 S255' for fan). Blocked: M112, M502, M500, M501, M997, M999.",
        ),
    },
    async ({ printer, command }) => {
      const upper = command.trim().toUpperCase();
      for (const prefix of BLOCKED_GCODE_PREFIXES) {
        if (upper.startsWith(prefix)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `G-code '${prefix}' is blocked for safety. Blocked commands: ${BLOCKED_GCODE_PREFIXES.join(", ")}`,
              },
            ],
          };
        }
      }

      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.sendGcode(command);
        return `G-code sent: ${command}`;
      });
    },
  );

  server.tool(
    "skip_objects",
    "Skip specific objects during a multi-object print. Skipped objects will not be printed.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID or omit for single printer"),
      object_ids: z
        .array(z.number())
        .describe("Array of object IDs to skip (from print status)"),
    },
    async ({ printer, object_ids }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.skipObjects(object_ids);
        return `Skipping objects: ${object_ids.join(", ")}`;
      });
    },
  );
}

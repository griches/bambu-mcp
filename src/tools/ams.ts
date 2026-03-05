import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";

export function registerAmsTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "change_filament",
    "Change to a different AMS filament tray on a printer.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID or omit for single printer"),
      tray: z
        .number()
        .describe("AMS tray number (0-3)"),
      target_temp: z
        .number()
        .optional()
        .describe("Target temperature for the filament change (°C). Optional."),
    },
    async ({ printer, tray, target_temp }) => {
      if (tray < 0 || tray > 3) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Tray number must be between 0 and 3.",
            },
          ],
        };
      }

      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.changeFilament(tray, target_temp);
        return `Changing to AMS tray ${tray}.`;
      });
    },
  );

  server.tool(
    "unload_filament",
    "Unload the current filament from the extruder on a printer (or all printers).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
    },
    async ({ printer }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.unloadFilament();
        return "Filament unload initiated.";
      });
    },
  );
}

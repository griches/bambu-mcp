import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";

export function registerCameraTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "set_recording",
    "Enable or disable camera recording on a printer (or all printers).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      enabled: z.boolean().describe("true to enable recording, false to disable"),
    },
    async ({ printer, enabled }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.setCameraRecording(enabled);
        return `Camera recording ${enabled ? "enabled" : "disabled"}.`;
      });
    },
  );

  server.tool(
    "set_timelapse",
    "Enable or disable timelapse recording on a printer (or all printers).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      enabled: z
        .boolean()
        .describe("true to enable timelapse, false to disable"),
    },
    async ({ printer, enabled }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.setTimelapse(enabled);
        return `Timelapse recording ${enabled ? "enabled" : "disabled"}.`;
      });
    },
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";

export function registerPrintControlTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "pause_print",
    "Pause the current print on a printer (or all printers).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
    },
    async ({ printer }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.pausePrint();
        return "Print paused.";
      });
    },
  );

  server.tool(
    "resume_print",
    "Resume a paused print on a printer (or all printers).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
    },
    async ({ printer }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.resumePrint();
        return "Print resumed.";
      });
    },
  );

  server.tool(
    "stop_print",
    "Stop/cancel the current print on a printer (or all printers). WARNING: This cannot be undone.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
    },
    async ({ printer }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.stopPrint();
        return "Print stopped.";
      });
    },
  );

  server.tool(
    "start_print",
    "Start printing a file that is already on the printer's SD card. Supports .3mf and .gcode files. Use list_files to see available files, or upload_file to add one first.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      file: z
        .string()
        .describe(
          "Filename on the printer's SD card (e.g. 'model.3mf' or 'benchy.gcode')",
        ),
      path: z
        .string()
        .optional()
        .describe(
          "Directory path where the file lives on the SD card (e.g. '/cache/'). Default: '/cache/'",
        ),
      plate: z
        .number()
        .optional()
        .describe("Plate number for .3mf files (1-based, default: 1)"),
      ams_mapping: z
        .array(z.number())
        .optional()
        .describe(
          "AMS slot mapping array. Index = color in file, value = AMS slot (0-3) or -1 for external spool. Default: [0]",
        ),
      bed_type: z
        .enum(["auto", "cool_plate", "eng_plate", "hot_plate", "textured_plate"])
        .optional()
        .describe("Bed/plate type. Default: auto"),
      bed_leveling: z
        .boolean()
        .optional()
        .describe("Enable auto bed leveling. Default: true"),
      flow_cali: z
        .boolean()
        .optional()
        .describe("Enable flow calibration. Default: true"),
      vibration_cali: z
        .boolean()
        .optional()
        .describe("Enable vibration calibration. Default: true"),
      timelapse: z
        .boolean()
        .optional()
        .describe("Record timelapse. Default: false"),
      layer_inspect: z
        .boolean()
        .optional()
        .describe("Enable first layer inspection. Default: false"),
      use_ams: z
        .boolean()
        .optional()
        .describe("Use AMS for filament. Default: true"),
    },
    async ({
      printer,
      file,
      path,
      plate,
      ams_mapping,
      bed_type,
      bed_leveling,
      flow_cali,
      vibration_cali,
      timelapse,
      layer_inspect,
      use_ams,
    }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        const result = await conn.mqtt.printFile({
          file,
          path: path || "/cache/",
          plate,
          ams_mapping,
          bed_type,
          bed_leveling,
          flow_cali,
          vibration_cali,
          timelapse,
          layer_inspect,
          use_ams,
        });
        const resultStr = JSON.stringify(result);
        if (
          result?.result?.toUpperCase() === "FAIL" ||
          result?.reason ||
          result?.error ||
          (result?.result && result.result !== "SUCCESS")
        ) {
          return `Failed to start print: ${resultStr}`;
        }
        return `Print started: ${file}\nPrinter response: ${resultStr}`;
      });
    },
  );
}

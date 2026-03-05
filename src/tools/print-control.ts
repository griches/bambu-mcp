import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";
import { downloadFile } from "../ftp-client.js";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

/**
 * Detect which plate number contains gcode inside a 3MF file on the printer.
 * Downloads the file to a temp location, inspects the ZIP contents, and returns
 * the first plate number that has a Metadata/plate_N.gcode entry.
 */
async function detectPlate(
  host: string,
  accessCode: string,
  remotePath: string,
): Promise<number | undefined> {
  const tmp = join(tmpdir(), `bambu-mcp-${Date.now()}.3mf`);
  try {
    await downloadFile(host, accessCode, remotePath, tmp);
    const output = execSync(`unzip -l "${tmp}"`, { encoding: "utf-8" });
    const matches = output.matchAll(/Metadata\/plate_(\d+)\.gcode\b/g);
    const plates = Array.from(matches, (m) => parseInt(m[1], 10)).sort(
      (a, b) => a - b,
    );
    return plates.length > 0 ? plates[0] : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

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
          "Directory path where the file was found by list_files (e.g. '/', '/cache/'). If omitted, defaults based on printer model.",
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
        // Auto-detect plate for 3MF files when not specified
        let resolvedPlate = plate;
        if (
          !plate &&
          file.toLowerCase().endsWith(".3mf")
        ) {
          const remotePath = `${(path || "/").replace(/\/$/, "")}/${file}`;
          resolvedPlate = await detectPlate(
            conn.config.host,
            conn.config.accessCode,
            remotePath,
          );
        }

        const result = await conn.mqtt.printFile({
          file,
          path,
          plate: resolvedPlate,
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
        const isFail =
          result?.result?.toUpperCase() === "FAIL" ||
          (result?.reason && result.reason.toLowerCase() !== "success") ||
          result?.error ||
          (result?.result && result.result.toLowerCase() !== "success");
        if (isFail) {
          return `Failed to start print: ${resultStr}`;
        }
        return `Print started: ${file}\nPrinter response: ${resultStr}`;
      });
    },
  );
}

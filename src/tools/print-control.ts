import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";
import { downloadFile } from "../ftp-client.js";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, readFileSync } from "fs";

interface PlateInfo {
  plate: number;
  filament_colors: string[];
  filament_ids: number[];
}

/**
 * Detect which plate has gcode and read its filament metadata from the 3MF.
 */
async function detect3mfInfo(
  host: string,
  accessCode: string,
  remotePath: string,
): Promise<PlateInfo | undefined> {
  const tmp = join(tmpdir(), `bambu-mcp-${Date.now()}.3mf`);
  try {
    await downloadFile(host, accessCode, remotePath, tmp);
    const output = execSync(`unzip -l "${tmp}"`, { encoding: "utf-8" });
    const matches = output.matchAll(/Metadata\/plate_(\d+)\.gcode\b/g);
    const plates = Array.from(matches, (m) => parseInt(m[1], 10)).sort(
      (a, b) => a - b,
    );
    if (plates.length === 0) return undefined;

    const plate = plates[0];
    let filamentColors: string[] = [];
    let filamentIds: number[] = [];

    try {
      const json = execSync(`unzip -p "${tmp}" "Metadata/plate_${plate}.json"`, {
        encoding: "utf-8",
      });
      const meta = JSON.parse(json);
      filamentColors = meta.filament_colors || [];
      filamentIds = meta.filament_ids || [];
    } catch {}

    return { plate, filament_colors: filamentColors, filament_ids: filamentIds };
  } catch {
    return undefined;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

/**
 * Build ams_mapping by matching filament colors from the 3MF against
 * the printer's AMS tray colors. Returns an array where each index
 * corresponds to a slicer filament slot, and the value is the global
 * AMS tray index (AMS0: 0-3, AMS1: 4-7, etc.).
 */
function buildAmsMapping(
  filamentColors: string[],
  filamentIds: number[],
  amsStatus: any,
): number[] | undefined {
  if (!amsStatus?.ams || !Array.isArray(amsStatus.ams)) return undefined;
  if (filamentColors.length === 0 || filamentIds.length === 0) return undefined;

  // Build a flat list of { globalIndex, color } from all AMS trays
  const trays: { globalIndex: number; color: string }[] = [];
  for (const ams of amsStatus.ams) {
    const amsIdx = parseInt(ams.id, 10);
    for (const tray of ams.tray || []) {
      const trayIdx = parseInt(tray.id, 10);
      const globalIndex = amsIdx * 4 + trayIdx;
      // tray_color is "RRGGBBAA", filament_colors are "#RRGGBB"
      const color = (tray.tray_color || "").substring(0, 6).toUpperCase();
      trays.push({ globalIndex, color });
    }
  }

  // For each filament color in the 3MF, find the matching AMS tray
  const maxId = Math.max(...filamentIds);
  const mapping = Array.from({ length: maxId + 1 }, (_, i) => i);

  for (let i = 0; i < filamentColors.length; i++) {
    const needed = filamentColors[i].replace("#", "").toUpperCase();
    const match = trays.find((t) => t.color === needed);
    if (match && i < filamentIds.length) {
      mapping[filamentIds[i]] = match.globalIndex;
    }
  }

  return mapping;
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
        // Auto-detect plate and AMS mapping for 3MF files when not specified
        let resolvedPlate = plate;
        let resolvedAmsMapping = ams_mapping;
        if (file.toLowerCase().endsWith(".3mf")) {
          const remotePath = `${(path || "/").replace(/\/$/, "")}/${file}`;
          const info = await detect3mfInfo(
            conn.config.host,
            conn.config.accessCode,
            remotePath,
          );
          if (info) {
            if (!plate) resolvedPlate = info.plate;
            if (!ams_mapping) {
              // Match filament colors from 3MF to printer's AMS trays
              const status = conn.mqtt.getCachedStatus();
              resolvedAmsMapping = buildAmsMapping(
                info.filament_colors,
                info.filament_ids,
                status.ams,
              );
            }
          }
        }

        const result = await conn.mqtt.printFile({
          file,
          path,
          plate: resolvedPlate,
          ams_mapping: resolvedAmsMapping,
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

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";
import type { PrinterStatus } from "../types.js";

function formatGcodeState(state: string): string {
  const states: Record<string, string> = {
    IDLE: "Idle",
    PREPARE: "Preparing",
    RUNNING: "Running",
    PAUSE: "Paused",
    FINISH: "Finished",
    FAILED: "Failed",
  };
  return states[state] || state;
}

function formatPrintStage(stage: number | string): string {
  const stages: Record<string, string> = {
    "-1": "Idle",
    "0": "Printing",
    "1": "Auto bed leveling",
    "2": "Heatbed preheating",
    "3": "Sweeping XY mech mode",
    "4": "Changing filament",
    "5": "M400 pause",
    "6": "Paused due to filament runout",
    "7": "Heating hotend",
    "8": "Calibrating extrusion",
    "9": "Scanning bed surface",
    "10": "Inspecting first layer",
    "11": "Identifying build plate type",
    "12": "Calibrating micro lidar",
    "13": "Homing toolhead",
    "14": "Cleaning nozzle tip",
    "15": "Checking extruder temperature",
    "16": "Paused by user",
    "17": "Pause - front cover falling",
    "18": "Calibrating micro lidar",
    "19": "Calibrating extrusion flow",
    "20": "Paused - nozzle temp malfunction",
    "21": "Paused - heat bed temp malfunction",
  };
  return stages[String(stage)] || `Unknown stage: ${stage}`;
}

function formatStatusMarkdown(
  name: string,
  status: PrinterStatus,
): string {
  if (!status || Object.keys(status).length === 0) {
    return `## ${name}\nNo status data available. Printer may be offline or not yet reporting.`;
  }

  const lines = [`## ${name}\n`];

  const gcodeState = status.gcode_state || "UNKNOWN";
  lines.push(`**Status:** ${formatGcodeState(gcodeState)}`);

  if (gcodeState === "RUNNING" || gcodeState === "PAUSE") {
    const percent = status.mc_percent ?? 0;
    lines.push(`**Progress:** ${percent}%`);

    const remaining = status.mc_remaining_time ?? 0;
    if (remaining > 0) {
      const hours = Math.floor(remaining / 60);
      const mins = remaining % 60;
      lines.push(`**Time Remaining:** ${hours}h ${mins}m`);
    }

    if (status.subtask_name) {
      lines.push(`**File:** ${status.subtask_name}`);
    }

    if (status.stg_cur !== undefined) {
      lines.push(`**Stage:** ${formatPrintStage(status.stg_cur)}`);
    }

    if (
      status.layer_num !== undefined &&
      status.total_layer_num !== undefined
    ) {
      lines.push(`**Layer:** ${status.layer_num}/${status.total_layer_num}`);
    }
  }

  lines.push("\n**Temperatures:**");
  const nozzle = status.nozzle_temper;
  const nozzleTarget = status.nozzle_target_temper;
  lines.push(
    `- Nozzle: ${nozzle ?? "N/A"}°C (Target: ${nozzleTarget ?? "N/A"}°C)`,
  );
  const bed = status.bed_temper;
  const bedTarget = status.bed_target_temper;
  lines.push(
    `- Bed: ${bed ?? "N/A"}°C (Target: ${bedTarget ?? "N/A"}°C)`,
  );
  if (status.chamber_temper !== undefined) {
    lines.push(`- Chamber: ${status.chamber_temper}°C`);
  }

  const spdLvl = status.spd_lvl;
  if (spdLvl !== undefined) {
    const speedNames: Record<number, string> = {
      1: "Silent",
      2: "Standard",
      3: "Sport",
      4: "Ludicrous",
    };
    lines.push(`**Speed:** ${speedNames[spdLvl] || `Level ${spdLvl}`}`);
  }

  if (status.wifi_signal) {
    lines.push(`**WiFi Signal:** ${status.wifi_signal}`);
  }

  if (status.lights_report?.length) {
    const lights = status.lights_report
      .map((l: any) => `${l.node}: ${l.mode}`)
      .join(", ");
    lines.push(`**Lights:** ${lights}`);
  }

  if (status.ams?.ams?.length) {
    lines.push("\n**AMS:**");
    for (const unit of status.ams.ams) {
      if (unit.tray) {
        for (const tray of unit.tray) {
          const color = tray.tray_color
            ? `#${tray.tray_color}`
            : "unknown";
          lines.push(
            `- Tray ${tray.id}: ${tray.tray_type || "empty"} (${color})`,
          );
        }
      }
    }
  }

  return lines.join("\n");
}

export function registerStatusTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "get_status",
    "Get current status of a printer (or all printers). Shows print progress, temperatures, speed, AMS, lights, etc.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      detailed: z
        .boolean()
        .optional()
        .describe(
          "Request full status push from printer (slower but fresh data). Default: false (use cached).",
        ),
      format: z
        .enum(["markdown", "json"])
        .optional()
        .describe("Output format. Default: markdown"),
    },
    async ({ printer, detailed, format }) => {
      const printers = fleet.resolvePrinters(printer);

      const results = await Promise.allSettled(
        printers.map(async (conn) => {
          const status = detailed
            ? await conn.mqtt.requestStatus()
            : conn.mqtt.getCachedStatus();

          if (format === "json") {
            const label =
              printers.length > 1
                ? `${conn.config.name || conn.config.id}: `
                : "";
            return `${label}${JSON.stringify(status, null, 2)}`;
          }

          return formatStatusMarkdown(
            conn.config.name || conn.config.id,
            status,
          );
        }),
      );

      const text = results
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : `## ${printers[i].config.name || printers[i].config.id}\nError: ${(r as PromiseRejectedResult).reason?.message || r.reason}`,
        )
        .join("\n\n---\n\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "get_version",
    "Get firmware and module version information from a printer.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
    },
    async ({ printer }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        const version = await conn.mqtt.getVersion();
        return JSON.stringify(version, null, 2);
      });
    },
  );
}

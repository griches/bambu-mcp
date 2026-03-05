import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";

const SPEED_PROFILES: Record<string, number> = {
  silent: 1,
  standard: 2,
  sport: 3,
  ludicrous: 4,
};

const MAX_NOZZLE_TEMP = 300;
const MAX_BED_TEMP = 120;

export function registerHardwareTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "set_speed",
    "Set print speed on a printer (or all printers). Use a profile name or a raw percentage.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      profile: z
        .enum(["silent", "standard", "sport", "ludicrous"])
        .optional()
        .describe("Speed profile name. Takes priority over 'percent' if both given."),
      percent: z
        .number()
        .optional()
        .describe("Raw speed percentage (50-166). Use this for fine-grained control instead of a profile."),
    },
    async ({ printer, profile, percent }) => {
      let speed: number;
      let label: string;

      if (profile) {
        speed = SPEED_PROFILES[profile];
        label = `${profile} (level ${speed})`;
      } else if (percent !== undefined) {
        if (percent < 50 || percent > 166) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Speed percent must be between 50 and 166.",
              },
            ],
          };
        }
        speed = percent;
        label = `${percent}%`;
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Specify either a profile (silent/standard/sport/ludicrous) or a percent (50-166).",
            },
          ],
        };
      }

      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.setPrintSpeed(speed);
        return `Speed set to ${label}.`;
      });
    },
  );

  server.tool(
    "set_light",
    "Control the LED lights on a printer (or all printers). Supports chamber light and work light.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      light: z
        .enum(["chamber_light", "work_light"])
        .optional()
        .describe("Which light to control. Default: chamber_light"),
      mode: z.enum(["on", "off"]).describe("Turn the light on or off"),
    },
    async ({ printer, light, mode }) => {
      const node = light || "chamber_light";
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.setLED(mode, node);
        // H2D has a second chamber light node for the right side
        if (node === "chamber_light" && conn.config.model?.toUpperCase() === "H2D") {
          await conn.mqtt.setLED(mode, "chamber_light2");
        }
        return `${node.replace("_", " ")} turned ${mode}.`;
      });
    },
  );

  server.tool(
    "set_temperature",
    "Set nozzle or bed temperature on a printer. Includes safety limits (nozzle max 300C, bed max 120C).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      target: z
        .enum(["nozzle", "bed"])
        .describe("Which heater to set"),
      temperature: z
        .number()
        .describe("Target temperature in Celsius. Use 0 to turn off."),
    },
    async ({ printer, target, temperature }) => {
      const maxTemp = target === "nozzle" ? MAX_NOZZLE_TEMP : MAX_BED_TEMP;

      if (temperature < 0 || temperature > maxTemp) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Temperature must be between 0 and ${maxTemp}°C for ${target}.`,
            },
          ],
        };
      }

      const gcode =
        target === "nozzle"
          ? `M104 S${temperature}`
          : `M140 S${temperature}`;

      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.sendGcode(gcode);
        return `${target} temperature set to ${temperature}°C.`;
      });
    },
  );

  server.tool(
    "set_nozzle",
    "Set the nozzle diameter on a printer (for profile selection).",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      diameter: z
        .number()
        .describe("Nozzle diameter in mm (e.g. 0.4, 0.6, 0.8)"),
    },
    async ({ printer, diameter }) => {
      return fleet.executeOnPrinters(printer, async (conn) => {
        await conn.mqtt.setNozzle(diameter);
        return `Nozzle diameter set to ${diameter}mm.`;
      });
    },
  );
}

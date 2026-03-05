import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FleetManager } from "../fleet-manager.js";
import * as ftp from "../ftp-client.js";
import * as path from "path";

export function registerFileTools(
  server: McpServer,
  fleet: FleetManager,
): void {
  server.tool(
    "list_files",
    "List files on a printer's SD card via FTP. Shows cached print files, timelapse videos, etc.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      path: z
        .string()
        .optional()
        .describe(
          "Remote directory path to list. Default: '/' (SD card root). Common paths: '/', '/timelapse/', '/cache/'",
        ),
    },
    async ({ printer, path: remotePath }) => {
      const dir = remotePath || "/";
      const printers = fleet.resolvePrinters(printer);

      const results = await Promise.allSettled(
        printers.map(async (conn) => {
          const files = await ftp.listFiles(
            conn.config.host,
            conn.config.accessCode,
            dir,
          );

          if (files.length === 0) {
            return printers.length > 1
              ? `[${conn.config.name || conn.config.id}] No files found in ${dir}`
              : `No files found in ${dir}`;
          }

          const header =
            printers.length > 1
              ? `### ${conn.config.name || conn.config.id} — ${dir}\n`
              : `### Files in ${dir}\n`;

          const rows = files.map((f) => {
            const sizeStr =
              f.type === "directory"
                ? "<DIR>"
                : formatSize(f.size);
            return `| ${f.name} | ${sizeStr} | ${f.date} | ${f.type} |`;
          });

          return `${header}| Name | Size | Modified | Type |\n|------|------|----------|------|\n${rows.join("\n")}`;
        }),
      );

      const text = results
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : `[${printers[i].config.name || printers[i].config.id}] Error: ${(r as PromiseRejectedResult).reason?.message || r.reason}`,
        )
        .join("\n\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "upload_file",
    "Upload a local file to a printer's SD card via FTP. Supports .3mf, .gcode files. Use start_print after uploading to begin printing.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      local_path: z
        .string()
        .describe("Absolute path to the local file to upload"),
      remote_path: z
        .string()
        .optional()
        .describe(
          "Remote path on printer. Default: '/<filename>' (SD card root)",
        ),
    },
    async ({ printer, local_path, remote_path }) => {
      const ext = path.extname(local_path).toLowerCase();
      const allowed = [".3mf", ".gcode", ".stl"];
      if (!allowed.includes(ext)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Only ${allowed.join(", ")} files can be uploaded. Got: ${ext}`,
            },
          ],
        };
      }

      if (local_path.includes("..")) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Path traversal not allowed.",
            },
          ],
        };
      }

      return fleet.executeOnPrinters(printer, async (conn) => {
        await ftp.uploadFile(
          conn.config.host,
          conn.config.accessCode,
          local_path,
          remote_path,
        );
        const filename = path.basename(local_path);
        return `Uploaded ${filename} to ${conn.config.name || conn.config.id}.`;
      });
    },
  );

  server.tool(
    "delete_file",
    "Delete a file from a printer's SD card via FTP.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID, 'all', or omit for single printer"),
      remote_path: z
        .string()
        .describe("Path of the file to delete on the printer (e.g. '/model.3mf')"),
    },
    async ({ printer, remote_path }) => {
      if (remote_path.includes("..")) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Path traversal not allowed.",
            },
          ],
        };
      }

      return fleet.executeOnPrinters(printer, async (conn) => {
        await ftp.deleteFile(
          conn.config.host,
          conn.config.accessCode,
          remote_path,
        );
        return `Deleted ${remote_path}.`;
      });
    },
  );

  server.tool(
    "download_file",
    "Download a file from a printer's SD card to your local machine via FTP.",
    {
      printer: z
        .string()
        .optional()
        .describe("Printer ID (cannot use 'all' for downloads)"),
      remote_path: z
        .string()
        .describe("Path of the file on the printer (e.g. '/model.3mf')"),
      local_path: z
        .string()
        .describe("Local path to save the downloaded file"),
    },
    async ({ printer, remote_path, local_path }) => {
      if (remote_path.includes("..") || local_path.includes("..")) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Path traversal not allowed.",
            },
          ],
        };
      }

      const printers = fleet.resolvePrinters(printer);
      if (printers.length > 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Download only works with a single printer. Specify a printer ID.",
            },
          ],
        };
      }

      const conn = printers[0];
      try {
        await ftp.downloadFile(
          conn.config.host,
          conn.config.accessCode,
          remote_path,
          local_path,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Downloaded ${remote_path} to ${local_path}.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Download failed: ${err.message}`,
            },
          ],
        };
      }
    },
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return `${size} ${units[i]}`;
}

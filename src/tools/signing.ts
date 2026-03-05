import { z } from "zod";
import * as crypto from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAppCert } from "../types.js";

export function registerSigningTools(server: McpServer): void {
  server.tool(
    "sign_message",
    "Sign a message using the Bambu Lab X.509 certificate. Used to authenticate with printers running firmware that requires certificate-based auth (post-January 2025 firmware).",
    {
      message: z
        .string()
        .describe("The message/payload to sign with the X.509 private key"),
    },
    async ({ message }) => {
      try {
        const { privateKey, cert } = getAppCert();

        const sign = crypto.createSign("SHA256");
        sign.update(message);
        sign.end();
        const signature = sign.sign(privateKey, "base64");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message,
                  signature,
                  certificate: cert
                    .replace("-----BEGIN CERTIFICATE-----", "")
                    .replace("-----END CERTIFICATE-----", "")
                    .replace(/\n/g, "")
                    .trim(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Signing failed: ${err.message}. You can override the certificate via BAMBU_APP_PRIVATE_KEY and BAMBU_APP_CERTIFICATE environment variables.`,
            },
          ],
        };
      }
    },
  );
}

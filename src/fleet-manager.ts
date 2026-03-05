import { BambuMQTTClient } from "./mqtt-client.js";
import type { PrinterConfig, PrinterStatus } from "./types.js";

export interface PrinterConnection {
  config: PrinterConfig;
  mqtt: BambuMQTTClient;
}

export class FleetManager {
  private printers: Map<string, PrinterConnection> = new Map();

  async connectPrinter(config: PrinterConfig): Promise<void> {
    // Disconnect existing connection if re-adding
    const existing = this.printers.get(config.id);
    if (existing) {
      existing.mqtt.disconnect();
    }

    const mqttClient = new BambuMQTTClient({
      host: config.host,
      port: 8883,
      username: "bblp",
      password: config.accessCode,
      deviceId: config.serialNumber,
    });

    await mqttClient.connect();
    this.printers.set(config.id, { config, mqtt: mqttClient });
  }

  disconnectPrinter(id: string): void {
    const conn = this.printers.get(id);
    if (conn) {
      conn.mqtt.disconnect();
      this.printers.delete(id);
    }
  }

  disconnectAll(): void {
    for (const conn of this.printers.values()) {
      conn.mqtt.disconnect();
    }
    this.printers.clear();
  }

  getPrinter(id: string): PrinterConnection | undefined {
    return this.printers.get(id);
  }

  getAllPrinters(): PrinterConnection[] {
    return Array.from(this.printers.values());
  }

  listIds(): string[] {
    return Array.from(this.printers.keys());
  }

  hasPrinter(id: string): boolean {
    return this.printers.has(id);
  }

  get size(): number {
    return this.printers.size;
  }

  /**
   * Resolve target printer(s) from user input.
   * - "all" → all printers
   * - specific id → that printer
   * - undefined with one printer → that printer
   * - undefined with multiple → error listing available IDs
   */
  resolvePrinters(target?: string): PrinterConnection[] {
    if (target === "all") {
      const all = this.getAllPrinters();
      if (all.length === 0) {
        throw new Error("No printers connected. Use add_printer first.");
      }
      return all;
    }

    if (target) {
      const printer = this.getPrinter(target);
      if (!printer) {
        throw new Error(
          `Printer '${target}' not found. Available: ${this.listIds().join(", ") || "none"}`,
        );
      }
      return [printer];
    }

    const all = this.getAllPrinters();
    if (all.length === 0) {
      throw new Error("No printers connected. Use add_printer first.");
    }
    if (all.length === 1) {
      return all;
    }
    throw new Error(
      `Multiple printers connected. Specify a printer ID or use 'all'. Available: ${this.listIds().join(", ")}`,
    );
  }

  /**
   * Execute an operation on one or more printers and format the results.
   */
  async executeOnPrinters(
    target: string | undefined,
    fn: (conn: PrinterConnection) => Promise<string>,
  ): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const printers = this.resolvePrinters(target);
    const results = await Promise.allSettled(
      printers.map(async (p) => {
        const result = await fn(p);
        return printers.length > 1
          ? `[${p.config.name || p.config.id}] ${result}`
          : result;
      }),
    );

    const text = results
      .map((r) =>
        r.status === "fulfilled"
          ? r.value
          : `Error: ${(r as PromiseRejectedResult).reason?.message || r.reason}`,
      )
      .join("\n\n");

    return { content: [{ type: "text" as const, text }] };
  }
}

import * as mqtt from "mqtt";
import type { PrinterStatus } from "./types.js";

export interface MQTTConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  deviceId: string;
  model?: string;
}

export class BambuMQTTClient {
  private client: mqtt.MqttClient | null = null;
  private config: MQTTConfig;
  private sequenceId: number = 0;
  private connected: boolean = false;
  private lastStatus: PrinterStatus = {};
  private lastStatusTime: number = 0;

  constructor(config: MQTTConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.client) {
      try {
        this.client.end(true);
      } catch {}
      this.client = null;
      this.connected = false;
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const options: mqtt.IClientOptions = {
        host: this.config.host,
        port: this.config.port,
        protocol: "mqtts",
        username: this.config.username,
        password: this.config.password,
        rejectUnauthorized: false,
        reconnectPeriod: 0,
        connectTimeout: 10000,
      };

      this.client = mqtt.connect(options);

      this.client.on("connect", () => {
        if (settled) return;
        settled = true;
        this.connected = true;
        this.client!.options.reconnectPeriod = 5000;

        const reportTopic = `device/${this.config.deviceId}/report`;
        this.client!.subscribe(reportTopic, (err) => {
          if (err) {
            console.error(`Failed to subscribe to ${reportTopic}:`, err);
            reject(err);
          } else {
            console.error(
              `Connected to printer ${this.config.deviceId} at ${this.config.host}`,
            );
            resolve();
          }
        });
      });

      this.client.on("message", (_topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());
          const status = data.print || data.mc_print;
          if (status) {
            this.lastStatus = { ...this.lastStatus, ...status };
            this.lastStatusTime = Date.now();
          }
        } catch {}
      });

      this.client.on("error", (err) => {
        console.error("MQTT error:", err.message);
        if (!settled) {
          settled = true;
          try {
            this.client?.end(true);
          } catch {}
          this.client = null;
          reject(this.enhanceError(err));
        }
      });

      this.client.on("close", () => {
        this.connected = false;
        if (!settled) {
          settled = true;
          try {
            this.client?.end(true);
          } catch {}
          this.client = null;
          reject(
            this.enhanceError(
              new Error("Connection closed before MQTT handshake completed"),
            ),
          );
        }
      });

      this.client.on("reconnect", () => {
        console.error(`MQTT reconnecting to ${this.config.host}...`);
      });
    });
  }

  private enhanceError(err: Error): Error {
    const msg = err.message || "";
    if (msg.includes("ECONNRESET") || msg.includes("connack timeout")) {
      return new Error(
        `${msg}. Bambu printers allow only one MQTT client — close BambuStudio, OrcaSlicer, or Home Assistant and retry.`,
      );
    }
    return err;
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.connected = false;
      this.lastStatus = {};
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private nextSeqId(): string {
    return (this.sequenceId++).toString();
  }

  private isH2D(): boolean {
    const model = (this.config.model || "").toUpperCase().trim();
    return ["H2D", "H2D PRO", "H2DPRO", "H2C", "H2S"].includes(model);
  }

  private async sendCommand(
    command: string,
    params: Record<string, any> = {},
    waitForResponse = true,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        reject(new Error("MQTT client not connected"));
        return;
      }

      const sequenceId = this.nextSeqId();
      const topic = `device/${this.config.deviceId}/request`;
      const [type, cmd] = command.split(".");

      const message = {
        [type]: {
          sequence_id: sequenceId,
          command: cmd,
          ...params,
        },
      };

      if (!waitForResponse) {
        this.client.publish(topic, JSON.stringify(message), (err) => {
          if (err) reject(err);
          else resolve({ sent: true, command });
        });
        return;
      }

      const responseHandler = (_receivedTopic: string, payload: Buffer) => {
        try {
          const response = JSON.parse(payload.toString());
          const responseData = response[type];
          if (responseData && responseData.sequence_id === sequenceId) {
            this.client!.removeListener("message", responseHandler);
            clearTimeout(timer);
            resolve(responseData);
          }
        } catch {}
      };

      this.client.on("message", responseHandler);

      this.client.publish(topic, JSON.stringify(message), (err) => {
        if (err) {
          this.client!.removeListener("message", responseHandler);
          reject(err);
        }
      });

      const timer = setTimeout(() => {
        this.client!.removeListener("message", responseHandler);
        reject(new Error(`Command '${command}' timed out after 10s`));
      }, 10000);
    });
  }

  // === Status ===

  async requestStatus(): Promise<PrinterStatus> {
    await this.sendCommand("pushing.pushall", {}, false);
    await new Promise((r) => setTimeout(r, 2000));
    return this.getCachedStatus();
  }

  getCachedStatus(): PrinterStatus {
    return {
      ...this.lastStatus,
      _cached_at: this.lastStatusTime
        ? new Date(this.lastStatusTime).toISOString()
        : null,
      _age_seconds: this.lastStatusTime
        ? Math.round((Date.now() - this.lastStatusTime) / 1000)
        : null,
    };
  }

  async getVersion(): Promise<any> {
    return this.sendCommand("info.get_version");
  }

  // === Print Control ===

  async stopPrint(): Promise<any> {
    return this.sendCommand("print.stop");
  }

  async pausePrint(): Promise<any> {
    return this.sendCommand("print.pause");
  }

  async resumePrint(): Promise<any> {
    return this.sendCommand("print.resume");
  }

  async setPrintSpeed(speed: number): Promise<any> {
    return this.sendCommand("print.print_speed", { param: speed.toString() });
  }

  async sendGcode(gcode: string): Promise<any> {
    return this.sendCommand("print.gcode_line", { param: gcode });
  }

  async printFile(options: {
    file: string;
    path?: string;
    plate?: number;
    ams_mapping?: number[];
    bed_type?: string;
    bed_leveling?: boolean;
    flow_cali?: boolean;
    vibration_cali?: boolean;
    layer_inspect?: boolean;
    timelapse?: boolean;
    use_ams?: boolean;
  }): Promise<any> {
    if (options.file.toLowerCase().endsWith(".3mf")) {
      return this.print3mfFile(options);
    }
    return this.printGcodeFile(options);
  }

  private async printGcodeFile(options: {
    file: string;
    path?: string;
    bed_type?: string;
    bed_leveling?: boolean;
    flow_cali?: boolean;
    vibration_cali?: boolean;
    layer_inspect?: boolean;
    timelapse?: boolean;
    use_ams?: boolean;
  }): Promise<any> {
    const dir = (options.path || "/cache/").replace(/\/$/, "");
    return this.sendCommand("print.gcode_file", {
      param: `${dir}/${options.file}`,
      subtask_name: options.file,
      bed_type: options.bed_type || "auto",
      bed_leveling: options.bed_leveling !== false,
      flow_cali: options.flow_cali !== false,
      vibration_cali: options.vibration_cali !== false,
      layer_inspect: options.layer_inspect || false,
      timelapse: options.timelapse || false,
      use_ams: options.use_ams !== false,
    });
  }

  private async print3mfFile(options: {
    file: string;
    path?: string;
    plate?: number;
    ams_mapping?: number[];
    bed_type?: string;
    bed_leveling?: boolean;
    flow_cali?: boolean;
    vibration_cali?: boolean;
    layer_inspect?: boolean;
    timelapse?: boolean;
    use_ams?: boolean;
  }): Promise<any> {
    const plate = options.plate || 1;
    const useAms = options.use_ams !== false;
    const amsMapping = options.ams_mapping || [0];
    const h2d = this.isH2D();

    // H2D uses ftp:// URL, other printers use file:///sdcard/
    let url: string;
    if (h2d) {
      const dir = (options.path || "/").replace(/\/$/, "");
      url = dir ? `ftp://${dir}/${options.file}` : `ftp://${options.file}`;
    } else {
      const dir = (options.path || "/cache/").replace(/\/$/, "");
      url = `file:///sdcard${dir}/${options.file}`;
    }

    const bedLeveling = options.bed_leveling !== false;
    const flowCali = options.flow_cali !== false;
    const vibrationCali = options.vibration_cali !== false;
    const layerInspect = options.layer_inspect || false;
    const timelapse = options.timelapse || false;

    return this.sendCommand("print.project_file", {
      param: `Metadata/plate_${plate}.gcode`,
      file: options.file,
      url,
      md5: "",
      subtask_name: options.file.replace(/\.3mf$/i, "").replace(/\.gcode$/i, ""),
      project_id: "0",
      profile_id: "0",
      task_id: "0",
      subtask_id: "0",
      bed_type: options.bed_type || "auto",
      bed_leveling: h2d ? (bedLeveling ? 1 : 0) : bedLeveling,
      flow_cali: h2d ? (flowCali ? 1 : 0) : flowCali,
      vibration_cali: h2d ? (vibrationCali ? 1 : 0) : vibrationCali,
      layer_inspect: h2d ? (layerInspect ? 1 : 0) : layerInspect,
      timelapse: h2d ? (timelapse ? 1 : 0) : timelapse,
      use_ams: useAms,
      ams_mapping: amsMapping,
    });
  }

  // === AMS / Filament ===

  async changeFilament(tray: number, targetTemp?: number): Promise<any> {
    const params: Record<string, any> = { target: tray };
    if (targetTemp !== undefined) {
      params.curr_temp = targetTemp;
      params.tar_temp = targetTemp;
    }
    return this.sendCommand("print.ams_change_filament", params);
  }

  async unloadFilament(): Promise<any> {
    return this.sendCommand("print.unload_filament");
  }

  // === LED ===

  async setLED(
    mode: "on" | "off",
    node: string = "chamber_light",
  ): Promise<any> {
    return this.sendCommand("system.ledctrl", {
      led_node: node,
      led_mode: mode,
      led_on_time: 500,
      led_off_time: mode === "on" ? 0 : 500,
      loop_times: mode === "on" ? 1 : 0,
      interval_time: 0,
    });
  }

  // === Camera ===

  async setCameraRecording(enabled: boolean): Promise<any> {
    return this.sendCommand("camera.ipcam_record_set", {
      control: enabled ? "enable" : "disable",
    });
  }

  async setTimelapse(enabled: boolean): Promise<any> {
    return this.sendCommand("camera.ipcam_timelapse", {
      control: enabled ? "enable" : "disable",
    });
  }

  // === Hardware ===

  async setNozzle(diameter: number): Promise<any> {
    return this.sendCommand("print.set_accessories", {
      accessory_type: "nozzle",
      nozzle_diameter: diameter.toString(),
    });
  }

  async skipObjects(objectIds: number[]): Promise<any> {
    return this.sendCommand("print.skip_objects", {
      obj_list: objectIds,
    });
  }
}

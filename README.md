# Bambu MCP

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for controlling Bambu Lab 3D printers. Manage one printer or an entire fleet from any MCP-compatible AI assistant.

## Features

- **Multi-printer fleet management** — target a specific printer, all printers, or auto-select when only one is configured
- **Full print control** — start, pause, resume, stop prints and skip objects mid-print. Auto-detects the correct plate in multi-plate 3MF files
- **File management** — list, upload, download, and delete files via FTP
- **Hardware control** — lights, temperatures, speed profiles, nozzle configuration
- **AMS support** — change filament trays, unload filament
- **Camera** — enable/disable recording and timelapse
- **Raw G-code** — send custom commands with safety limits
- **Persistent config** — printer credentials saved to `~/.bambu-mcp/printers.json`

## Supported Printers

Tested with:
- Bambu Lab P1S
- Bambu Lab H2D
- Bambu Lab A1 Mini

Should work with any Bambu Lab printer that supports MQTT over LAN (X1C, X1, P1P, A1, etc.).

## Printer Setup

Before using this MCP server, each printer must be configured for local access:

1. **Enable LAN Only Mode** — On the printer's touchscreen, go to **Settings > Network** and switch to **LAN Only Mode**. This is required for local MQTT commands (including starting prints) to work. Cloud mode blocks local print commands.

2. **Enable Developer Mode** — On the printer's touchscreen, go to **Settings > Network > LAN Only Mode** and enable **Developer Mode**. This allows third-party tools to send commands over the local network.

3. **Note the access code** — After enabling LAN Only / Developer Mode, a new **Access Code** will be shown on the printer screen. You'll need this to connect.

> **Note:** Enabling LAN Only Mode means you lose cloud features (remote monitoring via Bambu Handy app, cloud printing). All control must be done locally.

## System Requirements

- **Node.js** 18+
- Bambu Lab printer(s) on the same local network
- Printer in **LAN Only Mode** with **Developer Mode** enabled
- Printer **access code** and **serial number** (found in printer Settings > WLAN / Device)

## Installation

### Quick Start with npx

```bash
npx @griches/bambu-mcp
```

### Claude Code

```bash
claude mcp add bambu -- npx @griches/bambu-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bambu": {
      "command": "npx",
      "args": ["@griches/bambu-mcp"]
    }
  }
}
```

### Build from Source

```bash
git clone https://github.com/griches/bambu-mcp.git
cd bambu-mcp
npm install
npm run build
```

Then configure with the absolute path:

```json
{
  "mcpServers": {
    "bambu": {
      "command": "node",
      "args": ["/absolute/path/to/bambu-mcp/dist/index.js"]
    }
  }
}
```

## Adding Printers

Once the server is running, add printers using the `add_printer` tool. You'll need the following from each printer:

- **IP Address** — found on the printer's touchscreen under Settings > WLAN, or in Bambu Studio's Device tab
- **Access Code** — found on the touchscreen under Settings > WLAN, or in Bambu Studio's Device tab
- **Serial Number** — found on the touchscreen under Settings > Device, or in Bambu Studio's Device tab

Example (via an AI assistant):

> "Add my P1S at 192.168.0.136 with access code 30430928 and serial 01P00A3B0900744"

Printer configurations are saved to `~/.bambu-mcp/printers.json` and automatically reconnect on server restart.

## Tools

### Management

| Tool | Description |
|------|-------------|
| `add_printer` | Add a printer to the fleet (IP, access code, serial number) |
| `remove_printer` | Remove a printer and disconnect |
| `reconnect_printer` | Reconnect a printer (or all) after network changes |
| `list_printers` | List all configured printers with connection status |

### Status

| Tool | Description |
|------|-------------|
| `get_status` | Get printer status — print progress, temperatures, speed, AMS, lights |
| `get_version` | Get firmware and module version information |

### Print Control

| Tool | Description |
|------|-------------|
| `start_print` | Start printing a file from the printer's SD card. Auto-detects plate number for 3MF files |
| `pause_print` | Pause the current print |
| `resume_print` | Resume a paused print |
| `stop_print` | Cancel the current print |
| `skip_objects` | Skip specific objects in a multi-object print |

### Hardware

| Tool | Description |
|------|-------------|
| `set_speed` | Set print speed — silent, standard, sport, ludicrous, or custom % |
| `set_light` | Control chamber and work lights |
| `set_temperature` | Set nozzle or bed temperature (with safety limits) |
| `set_nozzle` | Set nozzle diameter for profile selection |

### File Management

| Tool | Description |
|------|-------------|
| `list_files` | List files on the printer's SD card |
| `upload_file` | Upload a .3mf or .gcode file to the printer |
| `download_file` | Download a file from the printer |
| `delete_file` | Delete a file from the printer |

### Camera

| Tool | Description |
|------|-------------|
| `set_recording` | Enable or disable camera recording |
| `set_timelapse` | Enable or disable timelapse recording |

### AMS / Filament

| Tool | Description |
|------|-------------|
| `change_filament` | Change to a different AMS filament tray |
| `unload_filament` | Unload filament from the extruder |

### G-code

| Tool | Description |
|------|-------------|
| `send_gcode` | Send raw G-code commands (dangerous commands blocked for safety) |

### Security

| Tool | Description |
|------|-------------|
| `sign_message` | Sign a message with the Bambu Lab X.509 certificate |

## Printer Targeting

Every printer-targeting tool accepts an optional `printer` parameter:

- **Specific printer** — use the printer ID (e.g. `"p1s-alpha"`)
- **All printers** — use `"all"` to run the command on every connected printer in parallel
- **Auto-select** — omit the parameter and it will auto-select if only one printer is configured

## Connection Details

This server communicates with printers using:

- **MQTT** (port 8883, TLS) — for commands and status updates
- **FTP** (port 990, implicit FTPS) — for file operations

Printers must be in **LAN Only Mode** with **Developer Mode** enabled. See [Printer Setup](#printer-setup) above.

## X.509 Certificate Authentication

Post-January 2025 firmware requires certificate-based authentication for local access. This server includes the publicly extracted X.509 certificate from the Bambu Connect desktop application by default.

To override with your own certificate, set these environment variables:

```bash
export BAMBU_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
export BAMBU_APP_CERTIFICATE="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

## License

MIT

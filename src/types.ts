export interface PrinterConfig {
  id: string;
  name: string;
  host: string;
  accessCode: string;
  serialNumber: string;
  model?: string;
}

export interface AppConfig {
  printers: PrinterConfig[];
}

export interface PrinterStatus {
  gcode_state?: string;
  print_type?: string;
  mc_percent?: number;
  mc_remaining_time?: number;
  layer_num?: number;
  total_layer_num?: number;
  subtask_name?: string;

  nozzle_temper?: number;
  nozzle_target_temper?: number;
  bed_temper?: number;
  bed_target_temper?: number;
  chamber_temper?: number;

  big_fan1_speed?: string;
  big_fan2_speed?: string;
  cooling_fan_speed?: string;
  heatbreak_fan_speed?: string;

  spd_lvl?: number;
  spd_mag?: number;

  ams?: {
    ams?: Array<{
      id: string;
      humidity: string;
      temp: string;
      tray?: Array<{
        id: string;
        tray_color?: string;
        tray_type?: string;
        remain?: number;
      }>;
    }>;
    ams_exist_bits?: string;
    tray_now?: string;
  };

  lights_report?: Array<{
    node: string;
    mode: string;
  }>;

  print_error?: number;
  hw_switch_state?: number;
  wifi_signal?: string;

  ipcam?: {
    ipcam_record?: string;
    timelapse?: string;
    resolution?: string;
  };

  [key: string]: any;
}

export interface FileInfo {
  name: string;
  size: number;
  date: string;
  type: "file" | "directory";
}

/**
 * X.509 Certificate extracted from Bambu Connect desktop application.
 *
 * In January 2025, Bambu Lab pushed firmware requiring authentication for
 * local LAN printer control. Community researchers extracted the X.509
 * certificate and private key from the Bambu Connect desktop app.
 *
 * These credentials are publicly available:
 * https://hackaday.com/2025/01/19/bambu-connects-authentication-x-509-certificate-and-private-key-extracted/
 *
 * Override via BAMBU_APP_PRIVATE_KEY and BAMBU_APP_CERTIFICATE env vars.
 */
export function getAppCert(): { privateKey: string; cert: string } {
  if (process.env.BAMBU_APP_PRIVATE_KEY && process.env.BAMBU_APP_CERTIFICATE) {
    return {
      privateKey: process.env.BAMBU_APP_PRIVATE_KEY,
      cert: process.env.BAMBU_APP_CERTIFICATE,
    };
  }

  return {
    privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDQNp2NfkajwcWH
PIqosa08P1ZwETPr1veZCMqieQxWtYw97wp+JCxX4yBrBcAwid7o7PHI9KQVzPRM
f0uXspaDUdSljrfJ/YwGEz7+GJz4+ml1UbWXBePyzXW1+N2hIGGn7BcNuA0v8rMY
uvVgiIIQNjLErgGcCWmMHLwsMMQ7LNprUZZKsSNB4HaQDH7cQZmYBN/O45np6l+K
VuLdzXdDpZcOM7bNO6smev822WPGDuKBo1iVfQbUe10X4dCNwkBR3QGpScVvg8gg
tRYZDYue/qc4Xaj806RZPttknWfxdvfZgoOmAiwnyQ5K3+mzNYHgQZAOC2ydkK4J
s+ZizK3lAgMBAAECggEAKwEcyXyrWmdLRQNcIDuSbD8ouzzSXIOp4BHQyH337nDQ
5nnY0PTns79VksU9TMktIS7PQZJF0brjOmmQU2SvcbAVG5y+mRmlMhwHhrPOuB4A
ahrWRrsQubV1+n/MRttJUEWS/WJmVuDp3NHAnI+VTYPkOHs4GeJXynik5PutjAr3
tYmr3kaw0Wo/hYAXTKsI/R5aenC7jH8ZSyVcZ/j+bOSH5sT5/JY122AYmkQOFE7s
JA0EfYJaJEwiuBWKOfRLQVEHhOFodUBZdGQcWeW3uFb88aYKN8QcKTO8/f6e4r8w
QojgK3QMj1zmfS7xid6XCOVa17ary2hZHAEPnjcigQKBgQDQnm4TlbVTsM+CbFUS
1rOIJRzPdnH3Y7x3IcmVKZt81eNktsdu56A4U6NEkFQqk4tVTT4TYja/hwgXmm6w
J+w0WwZd445Bxj8PmaEr6Z/NSMYbCsi8pRelKWmlIMwD2YhtY/1xXD37zpOgN8oQ
ryTKZR2gljbPxdfhKS7YerLp2wKBgQD/gJt3Ds69j1gMDLnnPctjmhsPRXh7PQ0e
E9lqgFkx/vNuCuyRs6ymic2rBZmkdlpjsTJFmz1bwOzIvSRoH6kp0Mfyo6why5kr
upDf7zz+hlvaFewme8aDeV3ex9Wvt73D66nwAy5ABOgn+66vZJeo0Iq/tnCwK3a/
evTL9BOzPwKBgEUi7AnziEc3Bl4Lttnqa08INZcPgs9grzmv6dVUF6J0Y8qhxFAd
1Pw1w5raVfpSMU/QrGzSFKC+iFECLgKVCHOFYwPEgQWNRKLP4BjkcMAgiP63QTU7
ZS2oHsnJp7Ly6YKPK5Pg5O3JVSU4t+91i7TDc+EfRwTuZQ/KjSrS5u4XAoGBAP06
v9reSDVELuWyb0Yqzrxm7k7ScbjjJ28aCTAvCTguEaKNHS7DP2jHx5mrMT35N1j7
NHIcjFG2AnhqTf0M9CJHlQR9B4tvON5ISHJJsNAq5jpd4/G4V2XTEiBNOxKvL1tQ
5NrGrD4zHs0R+25GarGcDwg3j7RrP4REHv9NZ4ENAoGAY7Nuz6xKu2XUwuZtJP7O
kjsoDS7bjP95ddrtsRq5vcVjJ04avnjsr+Se9WDA//t7+eSeHjm5eXD7u0NtdqZo
WtSm8pmWySOPXMn9QQmdzKHg1NOxer//f1KySVunX1vftTStjsZH7dRCtBEePcqg
z5Av6MmEFDojtwTqvEZuhBM=
-----END PRIVATE KEY-----`,
    cert: `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIRAO48rAcSzurNqLf7xC50uiwwDQYJKoZIhvcNAQELBQAw
JjEkMCIGA1UEAwwbR0xPRjM4MTM3MzQwODkuYmFtYnVsYWIuY29tMB4XDTI0MTIx
MTA5MjkyMFoXDTI1MTIxMjA5MjkyMFowTDEkMCIGA1UEChMbR0xPRjM4MTM3MzQw
ODktNTI0YTM3YzgwMDAwMSQwIgYDVQQDExtHTE9GMzgxMzczNDA4OS01MjRhMzdj
ODAwMDAwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDQNp2NfkajwcWH
PIqosa08P1ZwETPr1veZCMqieQxWtYw97wp+JCxX4yBrBcAwid7o7PHI9KQVzPRM
f0uXspaDUdSljrfJ/YwGEz7+GJz4+ml1UbWXBePyzXW1+N2hIGGn7BcNuA0v8rMY
uvVgiIIQNjLErgGcCWmMHLwsMMQ7LNprUZZKsSNB4HaQDH7cQZmYBN/O45np6l+K
VuLdzXdDpZcOM7bNO6smev822WPGDuKBo1iVfQbUe10X4dCNwkBR3QGpScVvg8gg
tRYZDYue/qc4Xaj806RZPttknWfxdvfZgoOmAiwnyQ5K3+mzNYHgQZAOC2ydkK4J
s+ZizK3lAgMBAAGjYDBeMA4GA1UdDwEB/wQEAwIDuDAMBgNVHRMBAf8EAjAAMB0G
A1UdDgQWBBTbM6dbfGu7o6o1IU59QyDzMcexjzAfBgNVHSMEGDAWgBTCydEtLumS
2pknAxmjOizTHKwImzANBgkqhkiG9w0BAQsFAAOCAQEAmmD3Fu37vgw4qr/Dgr15
FSdoCuVAZPD7I5FwcBlPH98TJ0hNUtnDVxkJ0pde8ZcQdYFkfYFNnX+7f06ps/TY
CtchEAlx9cXBfBnImO4mB2Y89uRh7HRA2BiUmme4Xjy5P3qyvOnx2lIiH2hFyXJ0
6N8UcBEviZTZd+D6FR5TJ8aNOhCwktutsrwKeSj4jrIWSD0vPlkQTbxUrm6x+7/i
JBwOsMNA5UB+SZxAn8BtcvzpxHaj1l3WRddZcykTfz6k8fuQfJCdp1aN47guLXWt
HTDvXeOlXpDStOlIwwMvh2i42ZaLas2C2B8rrX6pMmzazJLZcth8ZIyhfuB1WcMv
AQ==
-----END CERTIFICATE-----`,
  };
}

import { Client } from "basic-ftp";
import type { FileInfo } from "./types.js";
import * as path from "path";

export async function withFtpClient<T>(
  host: string,
  accessCode: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host,
      port: 990,
      user: "bblp",
      password: accessCode,
      secure: "implicit",
      secureOptions: { rejectUnauthorized: false },
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

export async function listFiles(
  host: string,
  accessCode: string,
  remotePath: string = "/",
): Promise<FileInfo[]> {
  return withFtpClient(host, accessCode, async (client) => {
    const list = await client.list(remotePath);
    return list.map((f) => ({
      name: f.name,
      size: f.size,
      date: f.modifiedAt?.toISOString() || f.rawModifiedAt || "",
      type: f.isDirectory ? ("directory" as const) : ("file" as const),
    }));
  });
}

export async function uploadFile(
  host: string,
  accessCode: string,
  localPath: string,
  remotePath?: string,
): Promise<void> {
  const remote = remotePath || `/${path.basename(localPath)}`;
  return withFtpClient(host, accessCode, async (client) => {
    await client.uploadFrom(localPath, remote);
  });
}

export async function deleteFile(
  host: string,
  accessCode: string,
  remotePath: string,
): Promise<void> {
  return withFtpClient(host, accessCode, async (client) => {
    await client.remove(remotePath);
  });
}

export async function downloadFile(
  host: string,
  accessCode: string,
  remotePath: string,
  localPath: string,
): Promise<void> {
  return withFtpClient(host, accessCode, async (client) => {
    await client.downloadTo(localPath, remotePath);
  });
}

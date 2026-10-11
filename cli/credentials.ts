import { chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import path from "path";

export interface Credential {
  token: string;
  expiresAt: string;
  email: string;
}

// Keyed by API base URL so prod, local, and preview logins can coexist.
type CredentialsFile = Record<string, Credential>;

export function credentialsPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(configHome, "sift", "credentials");
}

async function readAll(file: string): Promise<CredentialsFile> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Could not read ${file}; delete it and run \`sift login\` again.`);
  }
}

async function writeAll(file: string, all: CredentialsFile): Promise<void> {
  if (Object.keys(all).length === 0) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  // writeFile's mode only applies on create; tighten an existing file too.
  await chmod(file, 0o600);
}

export async function loadCredential(
  apiUrl: string,
  file = credentialsPath()
): Promise<Credential | null> {
  return (await readAll(file))[apiUrl] ?? null;
}

export async function saveCredential(
  apiUrl: string,
  credential: Credential,
  file = credentialsPath()
): Promise<void> {
  const all = await readAll(file);
  all[apiUrl] = credential;
  await writeAll(file, all);
}

export async function deleteCredential(
  apiUrl: string,
  file = credentialsPath()
): Promise<void> {
  const all = await readAll(file);
  delete all[apiUrl];
  await writeAll(file, all);
}

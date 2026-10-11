// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteCredential, loadCredential, saveCredential } from "./credentials";

const PROD = "https://sift.example.com";
const LOCAL = "http://localhost:3003";
const cred = (token: string) => ({ token, expiresAt: "2027-01-01T00:00:00.000Z", email: "a@b.c" });

describe("cli credentials", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sift-cli-"));
    file = path.join(dir, "sift", "credentials");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadCredential(PROD, file)).toBeNull();
  });

  it("saves with owner-only permissions", async () => {
    await saveCredential(PROD, cred("sift_mobile_a"), file);

    expect(await loadCredential(PROD, file)).toEqual(cred("sift_mobile_a"));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
  });

  it("tightens permissions on an existing loose file", async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{}", { mode: 0o644 });

    await saveCredential(PROD, cred("sift_mobile_a"), file);

    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("keeps logins for different API URLs separate", async () => {
    await saveCredential(PROD, cred("sift_mobile_prod"), file);
    await saveCredential(LOCAL, cred("sift_mobile_local"), file);

    await deleteCredential(LOCAL, file);

    expect(await loadCredential(LOCAL, file)).toBeNull();
    expect(await loadCredential(PROD, file)).toEqual(cred("sift_mobile_prod"));
  });

  it("deletes the file when the last login is removed", async () => {
    await saveCredential(PROD, cred("sift_mobile_a"), file);

    await deleteCredential(PROD, file);

    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

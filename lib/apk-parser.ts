import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AppInfoParser, {
  type ParsedManifest,
} from "app-info-parser";

/**
 * APK manifest inspection.
 *
 * `app-info-parser` reads the binary AndroidManifest.xml out of the zip's
 * central directory, which gives us package name, version, SDK range and the
 * launcher icon without shipping a full aapt toolchain.
 *
 * IMPORTANT: in Node the library takes a *file path* whose extension selects
 * the parser (apk/ipa) — it does not accept a Buffer. The upload route already
 * has the bytes in memory, so we stage them in a per-process temp dir with a
 * `.apk` suffix and clean up in `finally`.
 *
 * Every failure mode degrades to a partial result rather than throwing: a
 * corrupt or obfuscated APK still lands in the library.
 */

export interface ParsedApk {
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  appName: string | null;
  minSdk: number | null;
  targetSdk: number | null;
  iconDataUrl: string | null;
  sha256: string;
  sizeBytes: number;
  permissions: string[];
  /** false when the manifest could not be read at all */
  parsed: boolean;
}

const MAX_ICON_BYTES = 512 * 1024;
const PARSE_TIMEOUT_MS = 20_000;

let stagingRoot: string | null = null;

async function stagingDir(): Promise<string> {
  if (!stagingRoot) {
    stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-apk-"));
  }
  return stagingRoot;
}

export async function parseApk(buffer: Buffer): Promise<ParsedApk> {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const result: ParsedApk = {
    packageName: null,
    versionName: null,
    versionCode: null,
    appName: null,
    minSdk: null,
    targetSdk: null,
    iconDataUrl: null,
    sha256,
    sizeBytes: buffer.byteLength,
    permissions: [],
    parsed: false,
  };

  const dir = await stagingDir();
  const file = path.join(dir, `${sha256.slice(0, 16)}-${Date.now()}.apk`);

  try {
    await fs.writeFile(file, buffer);

    const manifest = await withTimeout(
      new AppInfoParser(file).parse(),
      PARSE_TIMEOUT_MS,
    );

    Object.assign(result, extract(manifest));
    result.parsed = true;
  } catch {
    // Corrupt zip, missing manifest, unreadable resources.arsc — all benign
    // here; the caller decides whether metadata-less APKs are acceptable.
    return result;
  } finally {
    await fs.unlink(file).catch(() => undefined);
  }

  return result;
}

function extract(manifest: ParsedManifest): Partial<ParsedApk> {
  const icon = typeof manifest.icon === "string" ? manifest.icon : null;

  return {
    packageName: typeof manifest.package === "string" ? manifest.package : null,
    versionName:
      manifest.versionName !== undefined ? String(manifest.versionName) : null,
    versionCode: toInt(manifest.versionCode),
    appName:
      pickLocale(manifest.appName) ?? pickLocale(manifest.application?.label),
    minSdk: toInt(manifest.usesSdk?.minSdkVersion),
    targetSdk: toInt(manifest.usesSdk?.targetSdkVersion),
    permissions: (
      manifest.permissions ??
      manifest.usesPermissions?.map((p) => p.name ?? "") ??
      []
    )
      .filter(Boolean)
      .slice(0, 40),
    // Guard against pathological icon payloads bloating the row/DB.
    iconDataUrl:
      icon && icon.startsWith("data:image/") && icon.length < MAX_ICON_BYTES
        ? icon
        : null,
  };
}

/** Decodes an icon data URL to a Buffer for object storage. */
export function iconBufferFromDataUrl(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const base64 = dataUrl.slice(comma + 1);
  const buf = Buffer.from(base64, "base64");
  return buf.byteLength > 0 && buf.byteLength <= MAX_ICON_BYTES ? buf : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("manifest parse timed out")), ms).unref?.(),
    ),
  ]);
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

/** Manifest labels can be locale maps — prefer English, then the first entry. */
function pickLocale(
  value: string | Record<string, string> | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  const entries = Object.entries(value).filter(
    ([, v]) => typeof v === "string" && v.trim(),
  );
  if (entries.length === 0) return null;
  const english =
    entries.find(([k]) => /^en(-|_|$)/i.test(k)) ??
    entries.find(([k]) => /^values-en/i.test(k));
  return (english ?? entries[0])[1].trim() || null;
}

export const APK_LIMITS = {
  maxBytes: Number(process.env.NEXUS_MAX_UPLOAD_BYTES ?? 512 * 1024 * 1024),
  minBytes: 1024,
  magic: "504b0304" as const, // "PK\x03\x04"
};

export function validateApkBuffer(buffer: Buffer, filename: string): string | null {
  if (!filename.toLowerCase().endsWith(".apk")) {
    return "Only .apk files are supported.";
  }
  if (buffer.byteLength < APK_LIMITS.minBytes) {
    return "That file is too small to be a valid APK.";
  }
  if (buffer.byteLength > APK_LIMITS.maxBytes) {
    return `APK exceeds the ${(APK_LIMITS.maxBytes / 1024 / 1024).toFixed(0)} MB limit.`;
  }
  if (buffer.subarray(0, 4).toString("hex") !== APK_LIMITS.magic) {
    return "Not a valid APK (bad zip signature).";
  }
  return null;
}

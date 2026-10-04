const ID_PATTERN = /^[a-p]{32}$/;

/**
 * Pulls a 32-char extension id out of a raw id, a Chrome Web Store URL,
 * or an Edge add-ons URL. Returns null if nothing usable was found.
 */
export function extractExtensionId(input: string): string | null {
  const trimmed = input.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const candidate = segments.find((s) => ID_PATTERN.test(s));
    if (candidate) return candidate;
  } catch {
    // not a URL, fall through
  }

  const match = trimmed.match(/[a-p]{32}/);
  return match ? match[0] : null;
}

/**
 * Builds the same URL Chrome itself calls to check for extension updates.
 * This is a public, unauthenticated Google endpoint — no key required.
 */
export function buildCrxDownloadUrl(extensionId: string): string {
  const params = new URLSearchParams({
    response: "redirect",
    prodversion: "120.0.6099.109",
    acceptformat: "crx2,crx3",
    x: `id=${extensionId}&installsource=ondemand&uc`
  });
  return `https://clients2.google.com/service/update2/crx?${params.toString()}`;
}

/**
 * A .crx file is a small binary header glued onto an ordinary zip archive.
 * This strips that header (CRX2 or CRX3) and returns the raw zip bytes.
 */
export function stripCrxHeader(buffer: Buffer): Buffer {
  const magic = buffer.toString("ascii", 0, 4);
  if (magic !== "Cr24") {
    throw new Error("Not a recognized .crx file (bad magic header).");
  }

  const version = buffer.readUInt32LE(4);

  if (version === 2) {
    const pubKeyLen = buffer.readUInt32LE(8);
    const sigLen = buffer.readUInt32LE(12);
    const offset = 16 + pubKeyLen + sigLen;
    return buffer.subarray(offset);
  }

  if (version === 3) {
    const headerSize = buffer.readUInt32LE(8);
    const offset = 12 + headerSize;
    return buffer.subarray(offset);
  }

  throw new Error(`Unsupported CRX version: ${version}`);
}

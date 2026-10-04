export const ID_PATTERN = /^[a-p]{32}$/i;

/**
 * Pulls an extension id or slug out of a raw id, Chrome Web Store URL,
 * Edge add-ons URL, or Firefox Add-ons URL.
 */
export function extractExtensionId(input: string): string | null {
  const trimmed = input.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed.toLowerCase();

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const segments = url.pathname.split("/").filter(Boolean);

    // Chrome / Edge 32-char ID
    const candidate = segments.find((s) => /^[a-p]{32}$/i.test(s));
    if (candidate) return candidate.toLowerCase();

    // Firefox Add-ons URL: addons.mozilla.org/.../addon/<slug>/
    if (url.hostname.includes("addons.mozilla.org")) {
      const addonIdx = segments.indexOf("addon");
      if (addonIdx !== -1 && segments[addonIdx + 1]) {
        return segments[addonIdx + 1].toLowerCase();
      }
    }
  } catch {
    // not a URL, fall through
  }

  const match = trimmed.match(/[a-p]{32}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Builds the Google Chrome extension update endpoint URL.
 */
export function buildCrxDownloadUrl(extensionId: string): string {
  const params = new URLSearchParams({
    response: "redirect",
    prodversion: "128.0.6613.120",
    acceptformat: "crx2,crx3",
    x: `id=${extensionId}&installsource=ondemand&uc`
  });
  return `https://clients2.google.com/service/update2/crx?${params.toString()}`;
}

/**
 * Strips CRX2 or CRX3 headers from Uint8Array or Buffer.
 */
export function stripCrxHeaderUint8Array(data: Uint8Array): Uint8Array {
  // Check magic "Cr24" (0x43 0x72 0x32 0x34)
  if (data[0] !== 0x43 || data[1] !== 0x72 || data[2] !== 0x32 || data[3] !== 0x34) {
    // Check if it's already a raw zip file (PK\x03\x04)
    if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
      return data;
    }
    throw new Error("Not a recognized .crx file (bad magic header).");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint32(4, true);

  if (version === 2) {
    const pubKeyLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    const offset = 16 + pubKeyLen + sigLen;
    return data.subarray(offset);
  }

  if (version === 3) {
    const headerSize = view.getUint32(8, true);
    const offset = 12 + headerSize;
    return data.subarray(offset);
  }

  throw new Error(`Unsupported CRX version: ${version}`);
}

export function stripCrxHeader(buffer: Buffer): Buffer {
  const result = stripCrxHeaderUint8Array(new Uint8Array(buffer));
  return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
}

export type PermissionRiskLevel = "high" | "medium" | "low" | "info";

export interface PermissionDetail {
  name: string;
  level: PermissionRiskLevel;
  description: string;
}

export const PERMISSION_DESCRIPTIONS: Record<string, { level: PermissionRiskLevel; description: string }> = {
  "<all_urls>": { level: "high", description: "Read and modify data on all visited websites" },
  "*://*/*": { level: "high", description: "Access all HTTP and HTTPS websites" },
  "http://*/*": { level: "high", description: "Access all unencrypted HTTP websites" },
  "https://*/*": { level: "high", description: "Access all secure HTTPS websites" },
  "webRequest": { level: "high", description: "Intercept and inspect real-time network traffic" },
  "webRequestBlocking": { level: "high", description: "Block, modify, and redirect network requests in flight" },
  "cookies": { level: "high", description: "Access, modify, and export session cookies and authentication tokens" },
  "nativeMessaging": { level: "high", description: "Exchange messages with native applications installed on your computer" },
  "debugger": { level: "high", description: "Attach Chrome DevTools debugger to browser sessions" },
  "proxy": { level: "high", description: "Manage and route browser traffic through custom proxy servers" },
  "management": { level: "high", description: "Manage, disable, and install other extensions" },
  "privacy": { level: "high", description: "Control privacy settings including WebRTC leaks and password saving" },
  "declarativeNetRequestFeedback": { level: "high", description: "Read details on matched network rules and blocked traffic" },
  
  "tabs": { level: "medium", description: "Access tab URLs, titles, and active browser tab state" },
  "activeTab": { level: "medium", description: "Temporary full access to the currently focused tab" },
  "storage": { level: "medium", description: "Store and retrieve persistent data in browser storage" },
  "unlimitedStorage": { level: "medium", description: "Store unlimited client-side data without quota limits" },
  "scripting": { level: "medium", description: "Inject JavaScript and CSS programmatically into web pages" },
  "clipboardRead": { level: "medium", description: "Read contents from the system clipboard" },
  "clipboardWrite": { level: "medium", description: "Write arbitrary data to the system clipboard" },
  "notifications": { level: "medium", description: "Display desktop system notifications" },
  "geolocation": { level: "medium", description: "Access the physical location of the device" },
  "webNavigation": { level: "medium", description: "Receive real-time notifications on frame navigation events" },
  "browsingData": { level: "medium", description: "Clear browser cache, history, and stored data" },
  "identity": { level: "medium", description: "Perform OAuth authentication using Google/third-party accounts" },
  "downloads": { level: "medium", description: "Initiate and manage file downloads" },
  "downloads.open": { level: "high", description: "Automatically execute or open downloaded files" },
  
  "alarms": { level: "low", description: "Schedule recurring background timers and tasks" },
  "contextMenus": { level: "low", description: "Add custom options to the right-click context menu" },
  "idle": { level: "low", description: "Detect when the user's machine is idle or locked" },
  "offscreen": { level: "low", description: "Create hidden DOM documents in MV3 for audio or DOM parsing" },
  "sidePanel": { level: "low", description: "Display custom UI inside the browser side panel" },
  "tts": { level: "low", description: "Access text-to-speech synthesis" },
  "power": { level: "low", description: "Override system power-saving and sleep modes" },
  "theme": { level: "low", description: "Customize the visual appearance of the browser" }
};

export function classifyPermission(perm: string): PermissionDetail {
  if (PERMISSION_DESCRIPTIONS[perm]) {
    return {
      name: perm,
      level: PERMISSION_DESCRIPTIONS[perm].level,
      description: PERMISSION_DESCRIPTIONS[perm].description
    };
  }

  // Check if it looks like a URL host match pattern
  if (perm.includes("://") || perm.startsWith("<all_urls>") || perm.includes("*")) {
    return {
      name: perm,
      level: "high",
      description: `Access web content and data on "${perm}"`
    };
  }

  return {
    name: perm,
    level: "info",
    description: "Standard extension capability"
  };
}

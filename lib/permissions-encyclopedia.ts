export interface PermissionDoc {
  name: string;
  category: "Network" | "Storage & Data" | "DOM & Tabs" | "System & Native" | "UI & Misc" | "Privacy & Security";
  level: "high" | "medium" | "low";
  summary: string;
  threatModel: string;
}

export const PERMISSIONS_DATABASE: PermissionDoc[] = [
  {
    name: "<all_urls>",
    category: "Network",
    level: "high",
    summary: "Full read and write access to all HTTP/HTTPS web traffic and DOM across every visited site.",
    threatModel: "Complete credential theft, session cookie extraction, arbitrary script injection, and site tampering."
  },
  {
    name: "*://*/*",
    category: "Network",
    level: "high",
    summary: "Universal access to all web pages.",
    threatModel: "Equivalent to <all_urls>; allows extracting banking credentials and intercepting form submissions."
  },
  {
    name: "webRequest",
    category: "Network",
    level: "high",
    summary: "Observe and analyze live network traffic in real time.",
    threatModel: "Telemetry harvesting, inspecting authorization headers, tokens, and API requests."
  },
  {
    name: "webRequestBlocking",
    category: "Network",
    level: "high",
    summary: "Block, redirect, or modify network requests and headers in flight.",
    threatModel: "Can strip Content Security Policy headers, inject malicious response bodies, and hijack redirects."
  },
  {
    name: "cookies",
    category: "Storage & Data",
    level: "high",
    summary: "Read, modify, and delete cookies for any domain.",
    threatModel: "Session hijacking, exporting OAuth tokens, bypassing multi-factor authentication sessions."
  },
  {
    name: "nativeMessaging",
    category: "System & Native",
    level: "high",
    summary: "Send and receive messages from native executable applications on the computer.",
    threatModel: "Bypasses browser sandbox to execute arbitrary native binary commands on the operating system."
  },
  {
    name: "debugger",
    category: "System & Native",
    level: "high",
    summary: "Attach Chrome DevTools debugger to all tabs and browser contexts.",
    threatModel: "Full remote control of browser sessions, heap snapshots, and execution interception."
  },
  {
    name: "proxy",
    category: "Network",
    level: "high",
    summary: "Route all browser traffic through a custom proxy server.",
    threatModel: "Man-in-the-middle (MITM) interception of entire unencrypted and HTTPS traffic."
  },
  {
    name: "management",
    category: "System & Native",
    level: "high",
    summary: "Manage, install, disable, and uninstall other extensions.",
    threatModel: "Disabling security and ad-blocking extensions or silently installing rogue extensions."
  },
  {
    name: "privacy",
    category: "Privacy & Security",
    level: "high",
    summary: "Control privacy settings including WebRTC leaks, password autofill, and safe browsing.",
    threatModel: "Disabling browser security features to reveal true IP addresses or intercept passwords."
  },
  {
    name: "declarativeNetRequestFeedback",
    category: "Network",
    level: "high",
    summary: "Access internal details on matched network rules and redirected URLs.",
    threatModel: "Extracting sensitive query parameters and visited destination endpoints."
  },
  {
    name: "downloads.open",
    category: "System & Native",
    level: "high",
    summary: "Automatically execute or open downloaded files on the host computer.",
    threatModel: "Malware payload delivery and automatic execution."
  },

  // Medium Risk Permissions
  {
    name: "tabs",
    category: "DOM & Tabs",
    level: "medium",
    summary: "Access URLs, titles, favicons, and active tab states across all windows.",
    threatModel: "Browsing history tracking and tab manipulation."
  },
  {
    name: "activeTab",
    category: "DOM & Tabs",
    level: "medium",
    summary: "Temporary access to the currently active tab when the user interacts with the extension.",
    threatModel: "Safe permission recommended by Google; only accesses the active page upon explicit user click."
  },
  {
    name: "storage",
    category: "Storage & Data",
    level: "medium",
    summary: "Store and retrieve persistent data in browser sync/local storage.",
    threatModel: "Local data persistence; minimal risk unless sensitive tokens are stored unencrypted."
  },
  {
    name: "unlimitedStorage",
    category: "Storage & Data",
    level: "medium",
    summary: "Bypass quota limits for IndexedDB and local storage.",
    threatModel: "High disk usage consumption."
  },
  {
    name: "scripting",
    category: "DOM & Tabs",
    level: "medium",
    summary: "Programmatically inject JavaScript and CSS into web pages (MV3 replacement for executeScript).",
    threatModel: "Can read DOM contents and modify web page interfaces."
  },
  {
    name: "clipboardRead",
    category: "Storage & Data",
    level: "medium",
    summary: "Read data from the system clipboard.",
    threatModel: "Exposing copied passwords, crypto wallet addresses, and sensitive text."
  },
  {
    name: "clipboardWrite",
    category: "Storage & Data",
    level: "medium",
    summary: "Write data to the system clipboard.",
    threatModel: "Clipboard hijacking (e.g. replacing cryptocurrency addresses)."
  },
  {
    name: "webNavigation",
    category: "DOM & Tabs",
    level: "medium",
    summary: "Receive real-time notifications on frame navigation and page load life cycles.",
    threatModel: "Tracking user navigation behavior across all sites."
  },
  {
    name: "geolocation",
    category: "Privacy & Security",
    level: "medium",
    summary: "Access physical GPS coordinates of the device.",
    threatModel: "Tracking user location."
  },
  {
    name: "notifications",
    category: "UI & Misc",
    level: "medium",
    summary: "Display desktop system notifications.",
    threatModel: "Phishing notification prompts and user disruption."
  },
  {
    name: "identity",
    category: "Privacy & Security",
    level: "medium",
    summary: "Perform OAuth authentication flows using Google accounts.",
    threatModel: "Requesting unauthorized user profile scopes."
  },
  {
    name: "downloads",
    category: "Storage & Data",
    level: "medium",
    summary: "Initiate and manage file downloads.",
    threatModel: "Downloading unexpected files to user disk."
  },
  {
    name: "browsingData",
    category: "Privacy & Security",
    level: "medium",
    summary: "Clear browser history, cache, and stored cookies.",
    threatModel: "Anti-forensics data wiping."
  },

  // Low / Safe Permissions
  {
    name: "alarms",
    category: "UI & Misc",
    level: "low",
    summary: "Schedule periodic background code execution at intervals.",
    threatModel: "Minimal; standard timer scheduling mechanism."
  },
  {
    name: "contextMenus",
    category: "UI & Misc",
    level: "low",
    summary: "Add custom options to the browser right-click menu.",
    threatModel: "Safe UI integration."
  },
  {
    name: "idle",
    category: "UI & Misc",
    level: "low",
    summary: "Detect when the computer screen is locked or idle.",
    threatModel: "Minimal telemetry risk."
  },
  {
    name: "offscreen",
    category: "DOM & Tabs",
    level: "low",
    summary: "Create hidden DOM documents in MV3 for audio playback or DOM parsing.",
    threatModel: "Sandboxed DOM processing."
  },
  {
    name: "sidePanel",
    category: "UI & Misc",
    level: "low",
    summary: "Display custom extension UI in Chrome's dedicated browser side panel.",
    threatModel: "Standard UI panel integration."
  },
  {
    name: "power",
    category: "System & Native",
    level: "low",
    summary: "Override system power-saving and sleep modes.",
    threatModel: "Prevents screen sleep during background downloads."
  },
  {
    name: "tts",
    category: "UI & Misc",
    level: "low",
    summary: "Access text-to-speech voice synthesis.",
    threatModel: "Speech output."
  }
];

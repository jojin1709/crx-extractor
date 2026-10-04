// Comprehensive Deep Inspector & Forensics Engine for GetCRX

export interface CspReport {
  raw: string;
  isMV3: boolean;
  directives: { name: string; values: string[]; risk: "high" | "medium" | "safe"; reason?: string }[];
  overallRisk: "high" | "medium" | "safe";
  warnings: string[];
}

export interface ContentScriptEntry {
  matches: string[];
  js?: string[];
  css?: string[];
  runAt?: string;
  allFrames?: boolean;
  matchAboutBlank?: boolean;
  world?: string;
}

export interface WarEntry {
  resources: string[];
  matches?: string[];
  extensionIds?: string[];
  isWildcard: boolean;
}

export interface ExternalMessagingAudit {
  matches: string[];
  ids: string[];
  acceptsTls: boolean;
  hasNativeMessaging: boolean;
  threatSummary: string;
}

export interface StorageForensicsItem {
  type: "chrome.storage.local" | "chrome.storage.sync" | "localStorage" | "sessionStorage" | "cookies";
  key: string;
  file: string;
  line: number;
}

export interface PrivacyApiFinding {
  api: "Camera / Microphone" | "WebRTC IP Leak" | "Geolocation" | "Clipboard Access" | "Notification";
  symbol: string;
  file: string;
  line: number;
  threat: string;
}

export interface DetectedLibrary {
  name: string;
  category: "Framework" | "Utility" | "Telemetry / Error" | "Networking" | "Bundler";
  version?: string;
  file: string;
}

export interface ObfuscationFinding {
  file: string;
  entropy: number;
  indicators: string[];
  isSuspicious: boolean;
}

export interface LicenseFinding {
  type: string;
  file: string;
  snippet: string;
}

export interface ParityReport {
  target: "Chrome MV3" | "Firefox MV2/MV3";
  isCrossBrowserReady: boolean;
  issues: string[];
  notes: string[];
}

export interface EnterprisePolicyOutput {
  extensionId: string;
  updateUrl: string;
  installAllowlistJson: string;
  extensionSettingsJson: string;
  windowsRegistryReg: string;
}

// 1. Content Security Policy Parser & Evaluator
export function evaluateCsp(manifest: any): CspReport | null {
  const cspField = manifest?.content_security_policy;
  if (!cspField) return null;

  let raw = "";
  let isMV3 = false;
  let parsedDirectives: { name: string; values: string[]; risk: "high" | "medium" | "safe"; reason?: string }[] = [];
  const warnings: string[] = [];

  if (typeof cspField === "string") {
    raw = cspField;
    const parts = raw.split(";").map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const name = tokens[0];
      const values = tokens.slice(1);
      let risk: "high" | "medium" | "safe" = "safe";
      let reason = "";

      if (values.includes("'unsafe-eval'") || values.includes("unsafe-eval")) {
        risk = "high";
        reason = "Allows string-to-code execution (eval / new Function)";
        warnings.push(`Directive '${name}' contains 'unsafe-eval' (High Risk)`);
      } else if (values.includes("'unsafe-inline'") || values.includes("unsafe-inline")) {
        risk = "high";
        reason = "Allows inline script execution without cryptographic nonces";
        warnings.push(`Directive '${name}' contains 'unsafe-inline' (High Risk)`);
      } else if (values.some(v => v.includes("http:") || v === "*")) {
        risk = "medium";
        reason = "Permits unencrypted or wildcard external resource loading";
        warnings.push(`Directive '${name}' allows wildcard or plaintext HTTP endpoints`);
      }

      parsedDirectives.push({ name, values, risk, reason });
    }
  } else if (typeof cspField === "object") {
    isMV3 = true;
    raw = JSON.stringify(cspField, null, 2);
    for (const [key, val] of Object.entries(cspField)) {
      if (typeof val === "string") {
        const parts = val.split(";").map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
          const tokens = part.split(/\s+/);
          const name = `${key}: ${tokens[0]}`;
          const values = tokens.slice(1);
          let risk: "high" | "medium" | "safe" = "safe";
          let reason = "";

          if (values.includes("'unsafe-eval'") || values.includes("unsafe-eval")) {
            risk = "high";
            reason = "Allows string execution (eval)";
            warnings.push(`MV3 CSP '${key}' contains 'unsafe-eval'`);
          } else if (values.includes("http:") || values.includes("*")) {
            risk = "medium";
            reason = "Wildcard or insecure resource loading";
          }
          parsedDirectives.push({ name, values, risk, reason });
        }
      }
    }
  }

  const overallRisk = parsedDirectives.some(d => d.risk === "high")
    ? "high"
    : parsedDirectives.some(d => d.risk === "medium")
    ? "medium"
    : "safe";

  return {
    raw,
    isMV3,
    directives: parsedDirectives,
    overallRisk,
    warnings
  };
}

// 2. Content Scripts Visualizer
export function extractContentScripts(manifest: any): ContentScriptEntry[] {
  if (!manifest || !Array.isArray(manifest.content_scripts)) return [];
  return manifest.content_scripts.map((cs: any) => ({
    matches: Array.isArray(cs.matches) ? cs.matches : [],
    js: Array.isArray(cs.js) ? cs.js : cs.js ? [cs.js] : [],
    css: Array.isArray(cs.css) ? cs.css : cs.css ? [cs.css] : [],
    runAt: cs.run_at || "document_idle",
    allFrames: !!cs.all_frames,
    matchAboutBlank: !!cs.match_about_blank,
    world: cs.world || "ISOLATED"
  }));
}

// 3. Web Accessible Resources (WAR)
export function extractWarEntries(manifest: any): WarEntry[] {
  if (!manifest || !manifest.web_accessible_resources) return [];
  const entries: WarEntry[] = [];

  // MV2 string array format
  if (Array.isArray(manifest.web_accessible_resources) && typeof manifest.web_accessible_resources[0] === "string") {
    entries.push({
      resources: manifest.web_accessible_resources,
      matches: ["<all_urls> (MV2 default)"],
      isWildcard: true
    });
  } else if (Array.isArray(manifest.web_accessible_resources)) {
    // MV3 object array format
    for (const item of manifest.web_accessible_resources) {
      if (typeof item === "object") {
        const matches = Array.isArray(item.matches) ? item.matches : [];
        const isWildcard = matches.includes("<all_urls>") || matches.includes("*://*/*") || matches.includes("*");
        entries.push({
          resources: Array.isArray(item.resources) ? item.resources : [],
          matches,
          extensionIds: Array.isArray(item.extension_ids) ? item.extension_ids : [],
          isWildcard
        });
      }
    }
  }
  return entries;
}

// 4. Externally Connectable & Native Messaging
export function evaluateExternalMessaging(manifest: any): ExternalMessagingAudit {
  const ext = manifest?.externally_connectable || {};
  const perms = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  const matches = Array.isArray(ext.matches) ? ext.matches : [];
  const ids = Array.isArray(ext.ids) ? ext.ids : [];
  const acceptsTls = !!ext.accepts_tls_channel_id;
  const hasNativeMessaging = perms.includes("nativeMessaging");

  let threatSummary = "No external web messaging interfaces exposed.";
  if (hasNativeMessaging && matches.length > 0) {
    threatSummary = "CRITICAL: Extension accepts messages from external websites AND has native host OS execution privileges.";
  } else if (matches.includes("<all_urls>") || matches.includes("*://*/*")) {
    threatSummary = "HIGH: Extension listens for messages from any website on the internet.";
  } else if (matches.length > 0) {
    threatSummary = `MEDIUM: Extension allows messages from ${matches.length} specific domains.`;
  }

  return {
    matches,
    ids,
    acceptsTls,
    hasNativeMessaging,
    threatSummary
  };
}

// 5. Local Storage & Cookie Forensics Scanner
export function scanStorageForensics(files: { path: string; text?: string }[]): StorageForensicsItem[] {
  const results: StorageForensicsItem[] = [];
  const regexList = [
    { type: "chrome.storage.local" as const, regex: /chrome\.storage\.local\.(?:get|set|remove)\s*\(\s*(?:\[([^\]]+)\]|['"`]([^'"`]+)['"`]|{([^}]+)})/g },
    { type: "chrome.storage.sync" as const, regex: /chrome\.storage\.sync\.(?:get|set|remove)\s*\(\s*(?:\[([^\]]+)\]|['"`]([^'"`]+)['"`]|{([^}]+)})/g },
    { type: "localStorage" as const, regex: /localStorage\.(?:getItem|setItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { type: "sessionStorage" as const, regex: /sessionStorage\.(?:getItem|setItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g },
    { type: "cookies" as const, regex: /chrome\.cookies\.(?:get|set|remove)\s*\(\s*{[^}]*name\s*:\s*['"`]([^'"`]+)['"`]/g },
  ];

  for (const file of files) {
    if (!file.text || !file.path.match(/\.(js|mjs|ts|tsx|jsx|html)$/i)) continue;
    const lines = file.text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const { type, regex } of regexList) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(lineText)) !== null) {
          const keyRaw = match[1] || match[2] || match[3] || "object/keys";
          const cleanedKey = keyRaw.replace(/['"`]/g, "").trim().slice(0, 60);
          if (cleanedKey && !results.some(r => r.key === cleanedKey && r.file === file.path)) {
            results.push({
              type,
              key: cleanedKey,
              file: file.path,
              line: i + 1
            });
          }
        }
      }
    }
  }
  return results.slice(0, 50);
}

// 6. Privacy & Hardware API Scanner
export function scanPrivacyApis(files: { path: string; text?: string }[]): PrivacyApiFinding[] {
  const findings: PrivacyApiFinding[] = [];
  const rules = [
    {
      api: "Camera / Microphone" as const,
      regex: /navigator\.mediaDevices\.getUserMedia|navigator\.getUserMedia|webkitGetUserMedia/g,
      threat: "Can stream audio/video or record camera without direct page prompt."
    },
    {
      api: "WebRTC IP Leak" as const,
      regex: /new\s+(?:window\.)?RTCPeerConnection|createDataChannel|createOffer/g,
      threat: "Can initiate peer-to-peer tunnels and leak local network IP addresses past VPNs."
    },
    {
      api: "Geolocation" as const,
      regex: /navigator\.geolocation\.getCurrentPosition|navigator\.geolocation\.watchPosition/g,
      threat: "Tracks real-time physical GPS coordinates of the user device."
    },
    {
      api: "Clipboard Access" as const,
      regex: /navigator\.clipboard\.readText|document\.execCommand\s*\(\s*['"]paste['"]/g,
      threat: "Reads confidential passwords, tokens, or personal data copied to the clipboard."
    }
  ];

  for (const file of files) {
    if (!file.text || !file.path.match(/\.(js|mjs|ts|tsx|jsx|html)$/i)) continue;
    const lines = file.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const rule of rules) {
        rule.regex.lastIndex = 0;
        const match = rule.regex.exec(lineText);
        if (match) {
          findings.push({
            api: rule.api,
            symbol: match[0],
            file: file.path,
            line: i + 1,
            threat: rule.threat
          });
        }
      }
    }
  }
  return findings.slice(0, 30);
}

// 7. Third-Party Library & Framework Detector (SCA)
export function detectLibraries(files: { path: string; text?: string }[]): DetectedLibrary[] {
  const detected: DetectedLibrary[] = [];
  const sigs = [
    { name: "React", category: "Framework" as const, regex: /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED|React\.createElement|react\.production\.min/i },
    { name: "Vue.js", category: "Framework" as const, regex: /Vue\.config|createApp|__VUE_HMR_RUNTIME__/i },
    { name: "jQuery", category: "Utility" as const, regex: /jQuery\s*v?([0-9.]+)|jQuery\.fn\.jquery/i },
    { name: "Lodash / Underscore", category: "Utility" as const, regex: /lodash\.templateSettings|VERSION\s*=\s*['"]([0-9.]+)['"][\s\S]*lodash/i },
    { name: "Sentry SDK", category: "Telemetry / Error" as const, regex: /@sentry\/browser|Sentry\.init/i },
    { name: "Axios", category: "Networking" as const, regex: /axios\.create|axios\.interceptors/i },
    { name: "Firebase", category: "Networking" as const, regex: /firebase\.initializeApp|getFirestore|firebaseapp\.com/i },
    { name: "Webpack Runtime", category: "Bundler" as const, regex: /webpackJsonp|__webpack_require__|webpackChunk/i },
    { name: "WXT Extension Framework", category: "Bundler" as const, regex: /defineBackground|defineContentScript|wxt/i },
    { name: "Plasmo Framework", category: "Bundler" as const, regex: /PlasmoCSConfig|plasmo/i },
    { name: "Tailwind CSS", category: "Framework" as const, regex: /tailwindcss|tailwind\.config/i }
  ];

  for (const file of files) {
    if (!file.text) continue;
    for (const sig of sigs) {
      if (!detected.some(d => d.name === sig.name)) {
        const match = file.text.match(sig.regex);
        if (match) {
          detected.push({
            name: sig.name,
            category: sig.category,
            version: match[1] || undefined,
            file: file.path
          });
        }
      }
    }
  }
  return detected;
}

// 8. Shannon Entropy & Obfuscation Detector
function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

export function detectObfuscation(files: { path: string; text?: string }[]): ObfuscationFinding[] {
  const results: ObfuscationFinding[] = [];

  for (const file of files) {
    if (!file.text || !file.path.match(/\.(js|mjs)$/i)) continue;
    const text = file.text;
    const entropy = calculateShannonEntropy(text.slice(0, 10000));
    const indicators: string[] = [];

    if (text.includes("eval(function(p,a,c,k,e,d)")) {
      indicators.push("Dean Edwards Packer syntax detected");
    }
    if ((text.match(/\\x[0-9a-fA-F]{2}/g) || []).length > 20) {
      indicators.push("Heavy Hexadecimal string encoding (\\x..)");
    }
    if ((text.match(/\\u[0-9a-fA-F]{4}/g) || []).length > 20) {
      indicators.push("Heavy Unicode string escape sequences");
    }
    if (text.includes("eval(String.fromCharCode(")) {
      indicators.push("eval(String.fromCharCode(...)) dynamic unpacker");
    }
    if (text.includes("[![]+![]]") || text.includes("(![]+[])[")) {
      indicators.push("JSFuck non-alphanumeric obfuscation");
    }
    if (entropy > 5.8 && text.length > 500) {
      indicators.push(`High Shannon Entropy (${entropy} bits/char)`);
    }

    if (indicators.length > 0) {
      results.push({
        file: file.path,
        entropy,
        indicators,
        isSuspicious: indicators.length >= 2 || entropy > 5.9
      });
    }
  }
  return results.slice(0, 15);
}

// 9. License & Open Source Header Harvester
export function harvestLicenses(files: { path: string; text?: string }[]): LicenseFinding[] {
  const findings: LicenseFinding[] = [];
  const licenseRegex = /(?:SPDX-License-Identifier:\s*([A-Za-z0-9.-]+)|(MIT License|Apache License|GNU General Public License|GPL-[0-9.]+|BSD [0-9]-Clause)|Copyright\s*(?:\(c\))?\s*[0-9]{4}[^\r\n]*)/gi;

  for (const file of files) {
    if (!file.text) continue;
    const isLicenseFile = file.path.match(/LICENSE|COPYING|NOTICE/i);
    if (isLicenseFile) {
      findings.push({
        type: "Dedicated License File",
        file: file.path,
        snippet: file.text.slice(0, 120).trim()
      });
      continue;
    }

    if (file.path.match(/\.(js|ts|css|html|json)$/i)) {
      licenseRegex.lastIndex = 0;
      const match = licenseRegex.exec(file.text.slice(0, 2000));
      if (match) {
        findings.push({
          type: match[1] || match[2] || "Copyright Header",
          file: file.path,
          snippet: match[0].slice(0, 80)
        });
      }
    }
  }
  return findings.slice(0, 15);
}

// 10. Firefox vs Chrome Parity Analyzer
export function analyzeCrossBrowserParity(manifest: any): ParityReport {
  const issues: string[] = [];
  const notes: string[] = [];
  const isMV3 = manifest?.manifest_version === 3;
  const isFirefox = !!manifest?.browser_specific_settings?.gecko;

  if (isMV3) {
    if (manifest.background?.service_worker && !manifest.background?.scripts) {
      issues.push("Firefox MV3 requires 'background.scripts' or Firefox 121+ for service worker compatibility.");
    }
    if (manifest.permissions?.includes("webRequestBlocking")) {
      issues.push("Chrome MV3 deprecated blocking 'webRequest' in favor of 'declarativeNetRequest'. Firefox MV3 still supports blocking.");
    }
    if (manifest.browser_action) {
      issues.push("Legacy 'browser_action' used. MV3 requires 'action'.");
    }
  }

  notes.push(isMV3 ? "Manifest V3 format" : "Manifest V2 legacy format");
  notes.push(isFirefox ? "Gecko Add-on ID declared" : "Chromium store structure");

  return {
    target: isMV3 ? "Chrome MV3" : "Firefox MV2/MV3",
    isCrossBrowserReady: issues.length === 0,
    issues,
    notes
  };
}

// 11. Enterprise Policy Generator
export function generateEnterprisePolicies(extensionId: string): EnterprisePolicyOutput {
  const id = extensionId.length === 32 ? extensionId : "EXTENSION_ID_HERE";
  const updateUrl = "https://clients2.google.com/service/update2/crx";

  const installAllowlistJson = JSON.stringify([id], null, 2);

  const extensionSettingsJson = JSON.stringify({
    [id]: {
      installation_mode: "allowed",
      update_url: updateUrl,
      blocked_permissions: ["<all_urls>", "webRequestBlocking", "nativeMessaging"]
    }
  }, null, 2);

  const windowsRegistryReg = `Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallAllowlist]
"1"="${id};${updateUrl}"

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionSettings]
"${id}"="{\\"installation_mode\\":\\"allowed\\",\\"update_url\\":\\"${updateUrl}\\"}"
`;

  return {
    extensionId: id,
    updateUrl,
    installAllowlistJson,
    extensionSettingsJson,
    windowsRegistryReg
  };
}

import JSZip from "jszip";
import { SecurityScanResult } from "./security-scanner";

export interface ManifestV3MigrationCheck {
  isMV3: boolean;
  score: number; // 0 to 100
  issues: Array<{
    field: string;
    description: string;
    remedy: string;
  }>;
}

/**
 * Resolves localized strings in manifest.json like __MSG_extName__
 * by inspecting _locales/en/messages.json or default_locale.
 */
export async function resolveLocalizedManifest(manifest: any, zip: JSZip): Promise<any> {
  if (!manifest || typeof manifest !== "object") return manifest;

  const defaultLocale = manifest.default_locale || "en";
  let messages: Record<string, { message?: string }> = {};

  const localeCandidates = [
    `_locales/${defaultLocale}/messages.json`,
    `_locales/en/messages.json`,
    `_locales/en_US/messages.json`,
    `_locales/en_GB/messages.json`
  ];

  for (const path of localeCandidates) {
    const file = zip.file(path);
    if (file) {
      try {
        const text = await file.async("text");
        messages = JSON.parse(text);
        break;
      } catch {}
    }
  }

  function replaceMsg(str: string): string {
    if (typeof str !== "string") return str;
    return str.replace(/__MSG_([a-zA-Z0-9_@]+)__/g, (_, key) => {
      if (messages[key]?.message) {
        return messages[key].message as string;
      }
      return str;
    });
  }

  const resolved = JSON.parse(JSON.stringify(manifest));

  if (resolved.name) resolved.name = replaceMsg(resolved.name);
  if (resolved.short_name) resolved.short_name = replaceMsg(resolved.short_name);
  if (resolved.description) resolved.description = replaceMsg(resolved.description);

  return resolved;
}

/**
 * Checks Manifest V2 to Manifest V3 readiness and flags deprecated patterns.
 */
export function checkManifestV3Readiness(manifest: any): ManifestV3MigrationCheck {
  const issues: ManifestV3MigrationCheck["issues"] = [];
  const mv = manifest.manifest_version || 2;
  let score = 100;

  if (mv === 2) {
    score -= 40;
    issues.push({
      field: "manifest_version: 2",
      description: "Extension uses deprecated Manifest V2 format.",
      remedy: "Upgrade 'manifest_version' to 3."
    });
  }

  if (manifest.background?.scripts) {
    score -= 20;
    issues.push({
      field: "background.scripts",
      description: "Background persistent/event pages are replaced with background.service_worker.",
      remedy: "Convert background scripts into a single service worker (`background: { service_worker: 'background.js' }`)."
    });
  }

  if (manifest.background?.page) {
    score -= 20;
    issues.push({
      field: "background.page",
      description: "HTML background pages are not supported in Manifest V3.",
      remedy: "Use offscreen documents or migrate logic to service workers."
    });
  }

  if (manifest.browser_action || manifest.page_action) {
    score -= 15;
    issues.push({
      field: manifest.browser_action ? "browser_action" : "page_action",
      description: "browser_action and page_action are unified into 'action' in MV3.",
      remedy: "Rename 'browser_action' or 'page_action' to 'action'."
    });
  }

  if (manifest.permissions?.includes("webRequestBlocking")) {
    score -= 15;
    issues.push({
      field: "permissions: ['webRequestBlocking']",
      description: "Blocking webRequest is restricted in Manifest V3.",
      remedy: "Migrate request modification and blocking logic to declarativeNetRequest API."
    });
  }

  if (manifest.content_security_policy && typeof manifest.content_security_policy === "string") {
    score -= 10;
    issues.push({
      field: "content_security_policy (string)",
      description: "In MV3, content_security_policy must be an object with 'extension_pages' key.",
      remedy: "Convert string CSP to `content_security_policy: { extension_pages: '...' }`."
    });
  }

  if (score < 0) score = 0;

  return {
    isMV3: mv >= 3,
    score,
    issues
  };
}

/**
 * Generates an exportable Markdown security audit report.
 */
export function generateSecurityMarkdownReport(
  meta: { id: string; name: string | null },
  manifest: any,
  scan: SecurityScanResult
): string {
  const date = new Date().toISOString().split("T")[0];
  const extensionName = meta.name || manifest?.name || meta.id;

  let md = `# Security Audit Report: ${extensionName}\n\n`;
  md += `**Extension ID:** \`${meta.id}\`  \n`;
  md += `**Date:** ${date}  \n`;
  md += `**Security Score:** **${scan.score}/100 (Grade: ${scan.grade})**  \n`;
  md += `**Manifest Version:** MV${manifest?.manifest_version || "Unknown"}  \n`;
  md += `**Files Scanned:** ${scan.filesScanned} files (${scan.scanDurationMs}ms)  \n\n`;

  md += `## Executive Summary\n\n`;
  md += `| Critical | High | Medium | Low | Total Findings |\n`;
  md += `| :---: | :---: | :---: | :---: | :---: |\n`;
  md += `| **${scan.summary.critical}** | **${scan.summary.high}** | **${scan.summary.medium}** | **${scan.summary.low}** | **${scan.findings.length}** |\n\n`;

  if (scan.secrets.length > 0) {
    md += `## ⚠️ Hardcoded Secrets & Leaked Credentials (${scan.secrets.length})\n\n`;
    for (const secret of scan.secrets) {
      md += `### ${secret.title} [${secret.severity.toUpperCase()}]\n`;
      md += `- **File:** \`${secret.file}${secret.line ? `:${secret.line}` : ""}\`\n`;
      md += `- **Details:** ${secret.description}\n`;
      if (secret.snippet) md += `- **Snippet:** \`${secret.snippet}\`\n`;
      md += `- **Remediation:** ${secret.recommendation}\n\n`;
    }
  }

  if (scan.codeVulnerabilities.length > 0) {
    md += `## 🛡️ Code Sinks & Hazardous APIs (${scan.codeVulnerabilities.length})\n\n`;
    for (const sink of scan.codeVulnerabilities) {
      md += `### ${sink.title} [${sink.severity.toUpperCase()}]\n`;
      md += `- **File:** \`${sink.file}${sink.line ? `:${sink.line}` : ""}\`\n`;
      md += `- **Description:** ${sink.description}\n`;
      if (sink.snippet) md += `- **Code:** \`${sink.snippet}\`\n`;
      md += `- **Remediation:** ${sink.recommendation}\n\n`;
    }
  }

  if (scan.cspAudit.length > 0) {
    md += `## 🔒 Content Security Policy & Exposure (${scan.cspAudit.length})\n\n`;
    for (const csp of scan.cspAudit) {
      md += `### ${csp.title} [${csp.severity.toUpperCase()}]\n`;
      md += `- **Description:** ${csp.description}\n`;
      if (csp.snippet) md += `- **Directives:** \`${csp.snippet}\`\n`;
      md += `- **Remediation:** ${csp.recommendation}\n\n`;
    }
  }

  const permissions = [
    ...(manifest?.permissions || []),
    ...(manifest?.host_permissions || []),
    ...(manifest?.optional_permissions || [])
  ];

  md += `## 📋 Declared Permissions (${permissions.length})\n\n`;
  if (permissions.length === 0) {
    md += `*No permissions declared (minimal footprint).*\n\n`;
  } else {
    for (const perm of permissions) {
      md += `- \`${perm}\`\n`;
    }
    md += `\n`;
  }

  md += `---\n*Generated by [GetCRX](https://getcrx.vercel.app) — Chrome Extension Unpacker & Security Auditor*\n`;

  return md;
}

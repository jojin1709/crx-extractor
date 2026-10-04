import JSZip from "jszip";
import { PermissionDetail, classifyPermission } from "./crx";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  category: "secret" | "sink" | "csp" | "manifest" | "network" | "permission";
  severity: SeverityLevel;
  title: string;
  description: string;
  file?: string;
  line?: number;
  snippet?: string;
  recommendation: string;
}

export interface SecurityScanResult {
  score: number; // 0 to 100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: SecurityFinding[];
  secrets: SecurityFinding[];
  codeVulnerabilities: SecurityFinding[];
  cspAudit: SecurityFinding[];
  manifestIssues: SecurityFinding[];
  filesScanned: number;
  scanDurationMs: number;
}

// Secret detection patterns with high confidence
const SECRET_RULES: Array<{
  id: string;
  name: string;
  severity: SeverityLevel;
  regex: RegExp;
  recommendation: string;
}> = [
  {
    id: "aws-access-key",
    name: "AWS Access Key ID",
    severity: "critical",
    regex: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    recommendation: "Rotate this AWS credential immediately and migrate authentication to backend APIs with IAM roles."
  },
  {
    id: "openai-api-key",
    name: "OpenAI API Secret Key",
    severity: "critical",
    regex: /sk-[a-zA-Z0-9_-]{32,64}/g,
    recommendation: "Revoke this key in the OpenAI console. Route AI requests through a secure proxy server instead of exposing keys in client-side extension scripts."
  },
  {
    id: "google-api-key",
    name: "Google / Firebase API Key",
    severity: "high",
    regex: /AIza[0-9A-Za-z\\-_]{35}/g,
    recommendation: "Ensure Google Cloud API keys have HTTP referrer/IP restrictions or Chrome Extension ID restrictions applied in the Google Cloud Console."
  },
  {
    id: "github-token",
    name: "GitHub Personal Access Token / Secret",
    severity: "critical",
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g,
    recommendation: "Revoke this GitHub token immediately on GitHub.com and remove hardcoded tokens from the codebase."
  },
  {
    id: "slack-token",
    name: "Slack Bot / User Token",
    severity: "critical",
    regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    recommendation: "Revoke this Slack token in your Slack App management portal."
  },
  {
    id: "stripe-key",
    name: "Stripe Secret / Restricted Key",
    severity: "critical",
    regex: /(?:sk_live|rk_live)_[0-9a-zA-Z]{24,99}/g,
    recommendation: "Revoke this live Stripe secret key in your Stripe Dashboard. Extensions should only ever use publishable keys (`pk_live_...`)."
  },
  {
    id: "private-key-block",
    name: "RSA / Elliptic Curve Private Key",
    severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    recommendation: "Never bundle cryptographic private keys inside extension source files. Anyone can extract and read them."
  },
  {
    id: "generic-jwt",
    name: "Hardcoded JSON Web Token (JWT)",
    severity: "medium",
    regex: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/g,
    recommendation: "Avoid hardcoding static JWT tokens. Tokens should be retrieved dynamically via OAuth / chrome.identity."
  }
];

// Dangerous JavaScript code sinks and execution patterns
const CODE_SINK_RULES: Array<{
  id: string;
  name: string;
  severity: SeverityLevel;
  regex: RegExp;
  description: string;
  recommendation: string;
}> = [
  {
    id: "eval-execution",
    name: "Dynamic Code Execution (eval)",
    severity: "high",
    regex: /\b(?:window\.)?eval\s*\(/g,
    description: "Use of eval() executes arbitrary strings as JavaScript, bypassing compile-time safety and risking XSS.",
    recommendation: "Refactor dynamic code execution to use JSON.parse() or structured logic. In Manifest V3, eval() is strictly prohibited by default."
  },
  {
    id: "new-function-execution",
    name: "Dynamic Function Constructor (new Function)",
    severity: "high",
    regex: /\bnew\s+Function\s*\(/g,
    description: "The Function constructor compiles code dynamically similarly to eval(), creating potential remote code execution pathways.",
    recommendation: "Replace new Function(...) with static functions or safe template evaluators."
  },
  {
    id: "dangerous-innerhtml",
    name: "Direct HTML Injection (innerHTML / outerHTML)",
    severity: "medium",
    regex: /\.(?:innerHTML|outerHTML)\s*=\s*[^;\n]+/g,
    description: "Assigning dynamic or user-controlled content to innerHTML can lead to Cross-Site Scripting (DOM XSS).",
    recommendation: "Use element.textContent, element.setAttribute, or sanitize input with DOMPurify before inserting HTML."
  },
  {
    id: "document-write",
    name: "Legacy Document Writing (document.write)",
    severity: "medium",
    regex: /\bdocument\.write(?:ln)?\s*\(/g,
    description: "document.write blocks DOM parsing and exposes the page to markup injection vulnerabilities.",
    recommendation: "Use standard modern DOM manipulation APIs (document.createElement, appendChild)."
  },
  {
    id: "unsafe-postmessage",
    name: "Unrestricted window.postMessage Listener",
    severity: "medium",
    regex: /window\.addEventListener\s*\(\s*['"]message['"]\s*,\s*(?:\((?:[^)]*)\)|function\s*\([^)]*\))\s*=>?\s*\{(?![^}]*event\.origin)/g,
    description: "Message event listener does not explicitly validate event.origin, allowing untrusted malicious websites to send synthetic messages.",
    recommendation: "Always check `if (event.origin !== 'https://trusted-domain.com') return;` inside postMessage listeners."
  },
  {
    id: "insecure-http",
    name: "Unencrypted HTTP Request Endpoint",
    severity: "low",
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1|schemas\.xmlsoap\.org)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    description: "Plain HTTP requests transmit data in plaintext without TLS encryption, vulnerable to MITM interception.",
    recommendation: "Upgrade all network endpoints to HTTPS."
  },
  {
    id: "tabs-executescript",
    name: "Legacy Arbitrary Script Injection (tabs.executeScript)",
    severity: "medium",
    regex: /chrome\.tabs\.executeScript\s*\(/g,
    description: "Legacy Manifest V2 script injection method. Deprecated in Manifest V3.",
    recommendation: "Migrate to `chrome.scripting.executeScript` in Manifest V3."
  }
];

export async function runSecurityScan(zip: JSZip, manifest: any): Promise<SecurityScanResult> {
  const startTime = Date.now();
  const findings: SecurityFinding[] = [];
  const secrets: SecurityFinding[] = [];
  const codeVulnerabilities: SecurityFinding[] = [];
  const cspAudit: SecurityFinding[] = [];
  const manifestIssues: SecurityFinding[] = [];

  // 1. Audit Manifest.json
  if (manifest) {
    auditManifest(manifest, findings, cspAudit, manifestIssues);
  }

  // 2. Scan all code and text files in the zip archive
  let filesScanned = 0;
  const textExtensions = /\.(js|ts|jsx|tsx|json|html|htm|vue|svelte|css|txt|env|conf|yaml|yml)$/i;

  const filePromises: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    if (!textExtensions.test(relativePath)) return;

    filesScanned++;
    filePromises.push(
      (async () => {
        try {
          const content = await file.async("text");
          scanFileContent(relativePath, content, findings, secrets, codeVulnerabilities);
        } catch {
          // ignore unreadable file
        }
      })()
    );
  });

  await Promise.all(filePromises);

  // Calculate score and grade
  const summary = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length
  };

  // Base score 100
  let score = 100;
  score -= summary.critical * 30;
  score -= summary.high * 15;
  score -= summary.medium * 6;
  score -= summary.low * 2;
  if (score < 0) score = 0;

  let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "A+";
  if (score >= 95 && summary.high === 0 && summary.critical === 0) grade = "A+";
  else if (score >= 85 && summary.critical === 0) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 30) grade = "D";
  else grade = "F";

  const scanDurationMs = Date.now() - startTime;

  return {
    score,
    grade,
    summary,
    findings,
    secrets,
    codeVulnerabilities,
    cspAudit,
    manifestIssues,
    filesScanned,
    scanDurationMs
  };
}

function auditManifest(
  manifest: any,
  findings: SecurityFinding[],
  cspAudit: SecurityFinding[],
  manifestIssues: SecurityFinding[]
) {
  const mv = manifest.manifest_version || 2;

  // Manifest Version Check
  if (mv < 3) {
    const finding: SecurityFinding = {
      id: "mv2-deprecated",
      category: "manifest",
      severity: "high",
      title: "Deprecated Manifest V2 Architecture",
      description: "Google Chrome has deprecated Manifest V2 extensions and begun phasing them out in favor of Manifest V3.",
      recommendation: "Migrate extension to Manifest V3 by converting background scripts to a Service Worker and using chrome.scripting APIs.",
      file: "manifest.json"
    };
    findings.push(finding);
    manifestIssues.push(finding);
  }

  // Content Security Policy (CSP) Audit
  const csp =
    typeof manifest.content_security_policy === "string"
      ? manifest.content_security_policy
      : manifest.content_security_policy?.extension_pages || "";

  if (csp) {
    if (csp.includes("'unsafe-eval'")) {
      const finding: SecurityFinding = {
        id: "csp-unsafe-eval",
        category: "csp",
        severity: "high",
        title: "Insecure CSP: 'unsafe-eval' Enabled",
        description: "The Content Security Policy permits 'unsafe-eval', allowing dynamic string execution and increasing vulnerability to arbitrary code execution.",
        recommendation: "Remove 'unsafe-eval' from the manifest's content_security_policy and rewrite dynamic code to use safe alternatives.",
        file: "manifest.json",
        snippet: csp
      };
      findings.push(finding);
      cspAudit.push(finding);
    }

    if (csp.includes("http://")) {
      const finding: SecurityFinding = {
        id: "csp-http-origin",
        category: "csp",
        severity: "medium",
        title: "Insecure CSP: Unencrypted HTTP Source Allowed",
        description: "The CSP specifies unencrypted http:// origins for scripts or resources.",
        recommendation: "Ensure all CSP directives require secure HTTPS endpoints.",
        file: "manifest.json",
        snippet: csp
      };
      findings.push(finding);
      cspAudit.push(finding);
    }
  }

  // Web Accessible Resources Wildcard Check
  if (manifest.web_accessible_resources) {
    const war = manifest.web_accessible_resources;
    let hasWildcard = false;

    if (Array.isArray(war)) {
      for (const item of war) {
        if (typeof item === "string" && (item === "*" || item.includes("*"))) {
          hasWildcard = true;
        } else if (typeof item === "object" && item.matches) {
          if (item.matches.includes("<all_urls>") || item.matches.includes("*://*/*")) {
            hasWildcard = true;
          }
        }
      }
    }

    if (hasWildcard) {
      const finding: SecurityFinding = {
        id: "war-wildcard-exposure",
        category: "csp",
        severity: "medium",
        title: "Overly Permissive Web Accessible Resources",
        description: "Resources exposed to <all_urls> or wildcards allow any visited website to detect extension installation (fingerprinting) or load internal assets.",
        recommendation: "Restrict web_accessible_resources 'matches' to only the exact domains that require access.",
        file: "manifest.json"
      };
      findings.push(finding);
      cspAudit.push(finding);
    }
  }

  // Externally Connectable Wildcard Check
  if (manifest.externally_connectable?.matches) {
    const matches: string[] = manifest.externally_connectable.matches;
    if (matches.includes("*://*/*") || matches.includes("<all_urls>") || matches.some((m) => m.startsWith("*://*."))) {
      const finding: SecurityFinding = {
        id: "externally-connectable-wildcard",
        category: "manifest",
        severity: "high",
        title: "Wildcard External Messaging Allowed",
        description: "The extension allows any web page on the internet to send messages to runtime.onMessageExternal.",
        recommendation: "Specify only trusted domains in 'externally_connectable.matches' and validate the sender origin in onMessageExternal.",
        file: "manifest.json"
      };
      findings.push(finding);
      manifestIssues.push(finding);
    }
  }

  // Sensitive Permissions Audit
  const allPerms = [
    ...(manifest.permissions || []),
    ...(manifest.host_permissions || []),
    ...(manifest.optional_permissions || [])
  ];

  if (allPerms.includes("<all_urls>") || allPerms.includes("*://*/*") || allPerms.includes("https://*/*")) {
    const finding: SecurityFinding = {
      id: "all-urls-permission",
      category: "permission",
      severity: "medium",
      title: "Broad Host Permission (<all_urls> / Universal Access)",
      description: "Extension requests permission to read and modify web content across every website the user visits.",
      recommendation: "Use activeTab permission or request scoped host permissions for specific target domains only when needed.",
      file: "manifest.json"
    };
    findings.push(finding);
  }

  if (allPerms.includes("nativeMessaging")) {
    const finding: SecurityFinding = {
      id: "native-messaging-permission",
      category: "permission",
      severity: "high",
      title: "Native Messaging Permission (Host Binary Execution)",
      description: "Extension can communicate with native desktop applications installed on the user's computer.",
      recommendation: "Ensure native message validation and verify the native host application does not execute untrusted commands.",
      file: "manifest.json"
    };
    findings.push(finding);
  }

  if (allPerms.includes("debugger")) {
    const finding: SecurityFinding = {
      id: "debugger-permission",
      category: "permission",
      severity: "high",
      title: "Debugger API Access (Chrome DevTools Protocol)",
      description: "The extension can attach to browser tabs via the Chrome DevTools Protocol to inspect and modify all browser operations.",
      recommendation: "Verify that debugger permission is strictly necessary and protected with authentication safeguards.",
      file: "manifest.json"
    };
    findings.push(finding);
  }
}

function scanFileContent(
  filePath: string,
  content: string,
  allFindings: SecurityFinding[],
  secrets: SecurityFinding[],
  codeVulnerabilities: SecurityFinding[]
) {
  const lines = content.split("\n");

  // Scan for Hardcoded Secrets
  for (const rule of SECRET_RULES) {
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.regex.exec(content)) !== null) {
      const matchIndex = match.index;
      const lineNumber = getLineNumber(content, matchIndex);
      const lineSnippet = (lines[lineNumber - 1] || "").trim().slice(0, 160);
      const matchedText = match[0];

      // Mask sensitive secret
      const masked =
        matchedText.length > 8
          ? matchedText.slice(0, 4) + "••••••••" + matchedText.slice(-4)
          : "••••••••";

      const finding: SecurityFinding = {
        id: `${rule.id}-${filePath}-${lineNumber}`,
        category: "secret",
        severity: rule.severity,
        title: `Possible Secret Leak: ${rule.name}`,
        description: `Found match for ${rule.name} pattern: \`${masked}\``,
        file: filePath,
        line: lineNumber,
        snippet: lineSnippet,
        recommendation: rule.recommendation
      };

      allFindings.push(finding);
      secrets.push(finding);
      break; // report at most once per rule per file to avoid flooding
    }
  }

  // Scan for Dangerous Code Sinks
  // Only scan script files
  if (/\.(js|ts|jsx|tsx|html)$/i.test(filePath)) {
    for (const rule of CODE_SINK_RULES) {
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.regex.exec(content)) !== null) {
        const matchIndex = match.index;
        const lineNumber = getLineNumber(content, matchIndex);
        const lineSnippet = (lines[lineNumber - 1] || "").trim().slice(0, 160);

        const finding: SecurityFinding = {
          id: `${rule.id}-${filePath}-${lineNumber}`,
          category: "sink",
          severity: rule.severity,
          title: rule.name,
          description: rule.description,
          file: filePath,
          line: lineNumber,
          snippet: lineSnippet,
          recommendation: rule.recommendation
        };

        allFindings.push(finding);
        codeVulnerabilities.push(finding);
        break; // max 1 per rule per file
      }
    }
  }
}

function getLineNumber(content: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

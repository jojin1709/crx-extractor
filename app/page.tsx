"use client";

import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import {
  extractExtensionId,
  buildCrxDownloadUrl,
  stripCrxHeaderUint8Array,
  classifyPermission,
  PermissionDetail
} from "@/lib/crx";
import {
  runSecurityScan,
  SecurityScanResult,
  SecurityFinding
} from "@/lib/security-scanner";
import {
  resolveLocalizedManifest,
  checkManifestV3Readiness,
  generateSecurityMarkdownReport,
  ManifestV3MigrationCheck
} from "@/lib/manifest-utils";
import { buildFileTree, TreeNode, ZipEntryInfo } from "@/lib/file-tree";
import { CodeViewer, DiffCodeViewer } from "@/lib/code-highlighter";
import { beautifyCode } from "@/lib/beautifier";
import {
  compareZipPackages,
  computeLineDiff,
  PackageDiffResult,
  FileDiffItem,
  DiffLine
} from "@/lib/diff-engine";
import {
  harvestNetworkEndpoints,
  NetworkHarvestResult,
  NetworkEndpoint
} from "@/lib/network-harvester";
import {
  PERMISSIONS_DATABASE,
  PermissionDoc
} from "@/lib/permissions-encyclopedia";
import {
  calculateHashes,
  FileHashResult
} from "@/lib/crypto-hashes";
import {
  evaluateCsp,
  extractContentScripts,
  extractWarEntries,
  evaluateExternalMessaging,
  scanStorageForensics,
  scanPrivacyApis,
  detectLibraries,
  detectObfuscation,
  harvestLicenses,
  analyzeCrossBrowserParity,
  generateEnterprisePolicies,
  CspReport,
  ContentScriptEntry,
  WarEntry,
  ExternalMessagingAudit,
  StorageForensicsItem,
  PrivacyApiFinding,
  DetectedLibrary,
  ObfuscationFinding,
  LicenseFinding,
  ParityReport,
  EnterprisePolicyOutput
} from "@/lib/deep-inspector";
import {
  computeBundleAnalytics,
  BundleAnalytics
} from "@/lib/bundle-analytics";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Download,
  Copy,
  Check,
  Search,
  ExternalLink,
  Code,
  AlertTriangle,
  FileArchive,
  Terminal,
  UploadCloud,
  Eye,
  File,
  Package,
  HelpCircle,
  X,
  Info,
  Lock,
  Key,
  Flame,
  FileDown,
  List,
  FolderTree,
  WrapText,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  GitCompare,
  Sparkles,
  Maximize2,
  Minimize2,
  Command,
  Sliders,
  Globe,
  Radio,
  History,
  Trash2,
  BookOpen,
  Cpu,
  Image as ImageIcon,
  PieChart,
  Building,
  Bookmark,
  Share2,
  Printer,
  Edit3,
  Save,
  FileCheck,
  Database,
  Layers,
  LockOpen
} from "lucide-react";

type Meta = {
  id: string;
  name: string | null;
  icon: string | null;
  description: string | null;
  notFound: boolean;
};

interface SearchMatch {
  file: string;
  line: number;
  snippet: string;
}

interface RecentAuditItem {
  id: string;
  name: string;
  icon: string | null;
  date: number;
}

interface MediaAssetItem {
  path: string;
  name: string;
  size: number;
  url: string;
}

const POPULAR_EXTENSIONS = [
  { name: "uBlock Lite", id: "ddkjiahejlhfcafbddmgiahcphecmpfh" },
  { name: "Dark Reader", id: "eimadpbcbfnmbkopoojfekhnkhdbieeh" },
  { name: "MetaMask", id: "nkbihfbeogaeaoehlefnkodbefgpgknn" },
  { name: "React DevTools", id: "fmkadmapgofadopljbjfkapdkoienihi" },
  { name: "Wappalyzer", id: "gppongmhjkpfnbhagpmjfkannfbllamg" },
  { name: "Bitwarden", id: "nngceckbapebfimnlniiiahkandclblb" }
];

type ActiveTab =
  | "overview"
  | "explorer"
  | "security"
  | "network"
  | "csp"
  | "assets"
  | "analytics"
  | "enterprise"
  | "diff"
  | "mv3";

export default function HomeWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ink flex items-center justify-center text-muted font-mono text-xs">
          Loading GetCRX Engine...
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}

function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "extracting" | "done" | "error">("idle");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showBookmarkletModal, setShowBookmarkletModal] = useState(false);

  // Archive inspection state
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryInfo[]>([]);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [unpackError, setUnpackError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rawFileContent, setRawFileContent] = useState<string | null>(null);
  const [fileImageUrl, setFileImageUrl] = useState<string | null>(null);
  const [manifestData, setManifestData] = useState<any | null>(null);
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [copiedHashes, setCopiedHashes] = useState<Record<string, boolean>>({});

  // Extracted files memory cache for deep inspectors
  const [allExtractedFiles, setAllExtractedFiles] = useState<{ path: string; size: number; text?: string }[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetItem[]>([]);
  const [packageHashes, setPackageHashes] = useState<FileHashResult | null>(null);

  // Code Explorer ergonomics, live modifier & beautifier
  const [isBeautified, setIsBeautified] = useState(false);
  const [isFullscreenCode, setIsFullscreenCode] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"path" | "content">("path");
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const [contentSearchMatches, setContentSearchMatches] = useState<SearchMatch[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editedCode, setEditedCode] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [isHardeningDownload, setIsHardeningDownload] = useState(false);

  // Deep Security Analysis & Custom Rules State
  const [securityScan, setSecurityScan] = useState<SecurityScanResult | null>(null);
  const [isScanningSecurity, setIsScanningSecurity] = useState(false);
  const [mv3Check, setMv3Check] = useState<ManifestV3MigrationCheck | null>(null);
  const [customRuleInput, setCustomRuleInput] = useState("");
  const [customRuleMatches, setCustomRuleMatches] = useState<Array<{ file: string; line: number; snippet: string }>>([]);
  const [isScanningCustomRule, setIsScanningCustomRule] = useState(false);

  // Network Endpoints & Telemetry Harvester
  const [networkHarvest, setNetworkHarvest] = useState<NetworkHarvestResult | null>(null);
  const [networkFilter, setNetworkFilter] = useState("");

  // Recent Audits History (LocalStorage)
  const [recentAudits, setRecentAudits] = useState<RecentAuditItem[]>([]);

  // Permissions Encyclopedia state
  const [encyclopediaSearch, setEncyclopediaSearch] = useState("");
  const [encyclopediaCategory, setEncyclopediaCategory] = useState<string>("All");

  // CRX Package Diff & Comparison Tool State
  const [zipBInstance, setZipBInstance] = useState<JSZip | null>(null);
  const [metaB, setMetaB] = useState<Meta | null>(null);
  const [diffResult, setDiffResult] = useState<PackageDiffResult | null>(null);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [isDiffing, setIsDiffing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load Recent Audits from LocalStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("getcrx_recent_audits");
      if (saved) {
        setRecentAudits(JSON.parse(saved));
      }
    } catch {}
  }, []);

  function saveRecentAudit(item: RecentAuditItem) {
    setRecentAudits((prev) => {
      const filtered = prev.filter((p) => p.id !== item.id);
      const updated = [item, ...filtered].slice(0, 10);
      try {
        localStorage.setItem("getcrx_recent_audits", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  function clearRecentAudits() {
    setRecentAudits([]);
    try {
      localStorage.removeItem("getcrx_recent_audits");
    } catch {}
  }

  // Keyboard shortcut for Command Palette (Ctrl+K or Cmd+K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if (e.key === "Escape") {
        setShowCommandPalette(false);
        setShowIdGuide(false);
        setShowEncyclopedia(false);
        setShowInstallGuide(false);
        setShowBookmarkletModal(false);
        setIsFullscreenCode(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-lookup if ID is in URL params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || params.get("url");
    if (idParam) {
      setQuery(idParam);
      runLookup(idParam);
    }
  }, []);

  // Compute Deep Forensics using useMemo
  const cspReport: CspReport | null = useMemo(() => evaluateCsp(manifestData), [manifestData]);
  const contentScripts: ContentScriptEntry[] = useMemo(() => extractContentScripts(manifestData), [manifestData]);
  const warEntries: WarEntry[] = useMemo(() => extractWarEntries(manifestData), [manifestData]);
  const externalMessaging: ExternalMessagingAudit = useMemo(() => evaluateExternalMessaging(manifestData), [manifestData]);
  const storageForensics: StorageForensicsItem[] = useMemo(() => scanStorageForensics(allExtractedFiles), [allExtractedFiles]);
  const privacyApis: PrivacyApiFinding[] = useMemo(() => scanPrivacyApis(allExtractedFiles), [allExtractedFiles]);
  const detectedLibraries: DetectedLibrary[] = useMemo(() => detectLibraries(allExtractedFiles), [allExtractedFiles]);
  const obfuscationFindings: ObfuscationFinding[] = useMemo(() => detectObfuscation(allExtractedFiles), [allExtractedFiles]);
  const licenseFindings: LicenseFinding[] = useMemo(() => harvestLicenses(allExtractedFiles), [allExtractedFiles]);
  const crossBrowserParity: ParityReport = useMemo(() => analyzeCrossBrowserParity(manifestData), [manifestData]);
  const enterprisePolicies: EnterprisePolicyOutput = useMemo(() => generateEnterprisePolicies(meta?.id || ""), [meta?.id]);
  const bundleAnalytics: BundleAnalytics = useMemo(
    () =>
      computeBundleAnalytics(
        allExtractedFiles,
        manifestData?.permissions?.length || 0,
        manifestData?.permissions?.includes("<all_urls>") || manifestData?.permissions?.includes("*://*/*")
      ),
    [allExtractedFiles, manifestData]
  );

  async function runLookup(targetIdOrUrl: string) {
    setStatus("looking");
    setErrorMsg(null);
    setMeta(null);
    setZipInstance(null);
    setZipEntries([]);
    setSelectedFile(null);
    setRawFileContent(null);
    setFileImageUrl(null);
    setManifestData(null);
    setSecurityScan(null);
    setMv3Check(null);
    setNetworkHarvest(null);
    setPackageHashes(null);
    setAllExtractedFiles([]);
    setMediaAssets([]);

    const id = extractExtensionId(targetIdOrUrl.trim());

    if (!id) {
      setErrorMsg("Please enter a valid 32-character Chrome extension ID, Chrome Web Store URL, or Firefox Add-on link.");
      setStatus("error");
      return;
    }

    try {
      const res = await fetch("/api/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: id })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(data.error ?? "Lookup failed. Verify the extension ID or URL.");
        setStatus("error");
        setIsUnpacking(false);
        return;
      }

      setMeta(data);
      setStatus("found");
      saveRecentAudit({
        id,
        name: data.name || id,
        icon: data.icon,
        date: Date.now()
      });
      loadZipData(id);
    } catch {
      setErrorMsg("Failed to reach lookup service.");
      setStatus("error");
      setIsUnpacking(false);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    runLookup(query);
  }

  async function loadZipData(id: string) {
    setIsUnpacking(true);
    setUnpackError(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: id })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setUnpackError(errData.error || "Could not unpack source files.");
        setIsUnpacking(false);
        return;
      }

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Compute cryptographic hashes
      calculateHashes(arrayBuffer).then(setPackageHashes);

      const zip = await JSZip.loadAsync(arrayBuffer);
      setZipInstance(zip);

      const entries: ZipEntryInfo[] = [];
      const fileCache: { path: string; size: number; text?: string }[] = [];
      const mediaList: MediaAssetItem[] = [];

      for (const [relativePath, file] of Object.entries(zip.files)) {
        const size = (file as any)._data?.uncompressedSize || 0;
        entries.push({
          path: relativePath,
          name: relativePath.split("/").filter(Boolean).pop() || relativePath,
          isDir: file.dir,
          size
        });

        if (!file.dir) {
          if (relativePath.match(/\.(js|mjs|ts|tsx|jsx|json|html|css|txt|md|yml|yaml|xml)$/i)) {
            try {
              const text = await file.async("text");
              fileCache.push({ path: relativePath, size, text });
            } catch {
              fileCache.push({ path: relativePath, size });
            }
          } else {
            fileCache.push({ path: relativePath, size });
            if (relativePath.match(/\.(png|jpe?g|gif|svg|webp|ico)$/i)) {
              try {
                const b64 = await file.async("base64");
                const mime = relativePath.endsWith(".svg") ? "image/svg+xml" : "image/png";
                mediaList.push({
                  path: relativePath,
                  name: relativePath.split("/").pop() || relativePath,
                  size,
                  url: `data:${mime};base64,${b64}`
                });
              } catch {}
            }
          }
        }
      }

      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.path.localeCompare(b.path);
      });

      setZipEntries(entries);
      setAllExtractedFiles(fileCache);
      setMediaAssets(mediaList);

      // Parse and localize manifest.json
      let parsedManifest: any = null;
      const manifestFile = zip.file("manifest.json");
      if (manifestFile) {
        const text = await manifestFile.async("text");
        try {
          const rawParsed = JSON.parse(text);
          parsedManifest = await resolveLocalizedManifest(rawParsed, zip);
          setManifestData(parsedManifest);
          if (parsedManifest.name && (!meta?.name || meta.name === "Chrome Web Store")) {
            setMeta((prev) => (prev ? { ...prev, name: parsedManifest.name } : prev));
          }
        } catch {}
      }

      // Run deep security scan & MV3 migration check & network harvester
      setIsScanningSecurity(true);
      try {
        const scan = await runSecurityScan(zip, parsedManifest);
        setSecurityScan(scan);
        const mv3 = checkManifestV3Readiness(parsedManifest || {});
        setMv3Check(mv3);
        const harvest = await harvestNetworkEndpoints(zip);
        setNetworkHarvest(harvest);
      } catch (e) {
        console.error("Security scan error:", e);
      } finally {
        setIsScanningSecurity(false);
      }
    } catch {
      setUnpackError("Failed to unpack archive.");
    } finally {
      setIsUnpacking(false);
    }
  }

  async function handleDownloadZip() {
    if (!meta) return;
    setStatus("extracting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: meta.id })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Extraction failed.");
        setStatus("error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta.id}-source.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus("done");
    } catch {
      setErrorMsg("Extraction failed. Please try again.");
      setStatus("error");
    }
  }

  // 1-Click Permission Stripper ("Hardened Mode")
  async function handleDownloadHardenedZip() {
    if (!zipInstance || !manifestData) return;
    setIsHardeningDownload(true);

    try {
      const hardenedManifest = JSON.parse(JSON.stringify(manifestData));
      const dangerousPerms = ["<all_urls>", "*://*/*", "webRequestBlocking", "cookies", "nativeMessaging", "debugger", "proxy"];
      if (Array.isArray(hardenedManifest.permissions)) {
        hardenedManifest.permissions = hardenedManifest.permissions.filter((p: string) => !dangerousPerms.includes(p));
      }
      if (Array.isArray(hardenedManifest.host_permissions)) {
        hardenedManifest.host_permissions = hardenedManifest.host_permissions.filter((p: string) => !dangerousPerms.includes(p));
      }

      const cloneZip = new JSZip();
      for (const [path, file] of Object.entries(zipInstance.files)) {
        if (!file.dir) {
          if (path === "manifest.json") {
            cloneZip.file("manifest.json", JSON.stringify(hardenedManifest, null, 2));
          } else {
            const data = await file.async("uint8array");
            cloneZip.file(path, data);
          }
        }
      }

      const zipBlob = await cloneZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${meta?.id || "extension"}-hardened-privacy.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to build hardened package: " + err.message);
    } finally {
      setIsHardeningDownload(false);
    }
  }

  function handleDownloadRawCrx() {
    if (!meta) return;
    const url = buildCrxDownloadUrl(meta.id);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.download = `${meta.id}.crx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleDownloadManifest() {
    if (!manifestData) return;
    const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta?.id || "extension"}-manifest.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportSecurityReport() {
    if (!securityScan || !meta) return;
    const md = generateSecurityMarkdownReport(meta, manifestData, securityScan);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.id}-security-audit.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleCopyShareLink() {
    if (!meta) return;
    const shareUrl = `${window.location.origin}/?id=${encodeURIComponent(meta.id)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  }

  async function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    processLocalFile(file);
  }

  async function processLocalFile(file: File) {
    setStatus("extracting");
    setErrorMsg(null);
    setIsUnpacking(true);
    setSecurityScan(null);
    setMv3Check(null);
    setNetworkHarvest(null);
    setPackageHashes(null);
    setAllExtractedFiles([]);
    setMediaAssets([]);

    setMeta({
      id: file.name.replace(/\.[^/.]+$/, ""),
      name: file.name,
      icon: null,
      description: `Local file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      notFound: false
    });

    try {
      const buffer = await file.arrayBuffer();
      calculateHashes(buffer).then(setPackageHashes);

      const uint8 = new Uint8Array(buffer);
      const zipBytes = stripCrxHeaderUint8Array(uint8);
      const zip = await JSZip.loadAsync(zipBytes);

      setZipInstance(zip);
      const entries: ZipEntryInfo[] = [];
      const fileCache: { path: string; size: number; text?: string }[] = [];
      const mediaList: MediaAssetItem[] = [];

      for (const [relativePath, zipFile] of Object.entries(zip.files)) {
        const size = (zipFile as any)._data?.uncompressedSize || 0;
        entries.push({
          path: relativePath,
          name: relativePath.split("/").filter(Boolean).pop() || relativePath,
          isDir: zipFile.dir,
          size
        });

        if (!zipFile.dir) {
          if (relativePath.match(/\.(js|mjs|ts|tsx|jsx|json|html|css|txt|md|yml|yaml|xml)$/i)) {
            try {
              const text = await zipFile.async("text");
              fileCache.push({ path: relativePath, size, text });
            } catch {
              fileCache.push({ path: relativePath, size });
            }
          } else {
            fileCache.push({ path: relativePath, size });
            if (relativePath.match(/\.(png|jpe?g|gif|svg|webp|ico)$/i)) {
              try {
                const b64 = await zipFile.async("base64");
                const mime = relativePath.endsWith(".svg") ? "image/svg+xml" : "image/png";
                mediaList.push({
                  path: relativePath,
                  name: relativePath.split("/").pop() || relativePath,
                  size,
                  url: `data:${mime};base64,${b64}`
                });
              } catch {}
            }
          }
        }
      }

      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.path.localeCompare(b.path);
      });

      setZipEntries(entries);
      setAllExtractedFiles(fileCache);
      setMediaAssets(mediaList);

      let parsedManifest: any = null;
      const manifestFile = zip.file("manifest.json");
      if (manifestFile) {
        const text = await manifestFile.async("text");
        try {
          const rawParsed = JSON.parse(text);
          parsedManifest = await resolveLocalizedManifest(rawParsed, zip);
          setManifestData(parsedManifest);
          if (parsedManifest.name) {
            setMeta((prev) => (prev ? { ...prev, name: parsedManifest.name } : prev));
          }
        } catch {}
      }

      setIsScanningSecurity(true);
      const scan = await runSecurityScan(zip, parsedManifest);
      setSecurityScan(scan);
      const mv3 = checkManifestV3Readiness(parsedManifest || {});
      setMv3Check(mv3);
      const harvest = await harvestNetworkEndpoints(zip);
      setNetworkHarvest(harvest);
      setIsScanningSecurity(false);

      setStatus("found");
      setActiveTab("explorer");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to parse local file. Ensure it is a valid .crx, .xpi, or .zip file.");
      setStatus("error");
    } finally {
      setIsUnpacking(false);
      setIsScanningSecurity(false);
    }
  }

  // Handle uploading Package B for diff comparison
  async function handleUploadPackageB(file: File) {
    setIsDiffing(true);
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const zipBytes = stripCrxHeaderUint8Array(uint8);
      const zipB = await JSZip.loadAsync(zipBytes);

      setZipBInstance(zipB);
      setMetaB({
        id: file.name.replace(/\.[^/.]+$/, ""),
        name: file.name,
        icon: null,
        description: `Compare Target: ${file.name}`,
        notFound: false
      });

      if (zipInstance) {
        const result = await compareZipPackages(zipInstance, zipB);
        setDiffResult(result);
        if (result.fileChanges.length > 0) {
          const firstMod = result.fileChanges.find((f) => f.status === "modified") || result.fileChanges[0];
          handleSelectDiffFile(firstMod.path, zipInstance, zipB);
        }
      }
    } catch (err: any) {
      alert("Failed to parse compare package: " + err.message);
    } finally {
      setIsDiffing(false);
    }
  }

  async function handleSelectDiffFile(path: string, zipA?: JSZip, zipB?: JSZip) {
    const zA = zipA || zipInstance;
    const zB = zipB || zipBInstance;
    if (!zA || !zB) return;

    setSelectedDiffFile(path);
    const fileA = zA.file(path);
    const fileB = zB.file(path);

    const textA = fileA ? await fileA.async("text").catch(() => "") : "";
    const textB = fileB ? await fileB.async("text").catch(() => "") : "";

    const lines = computeLineDiff(textA, textB);
    setDiffLines(lines);
  }

  async function handleSelectFile(path: string, jumpLine?: number) {
    if (!zipInstance) return;
    const file = zipInstance.file(path);
    if (!file) return;

    setSelectedFile(path);
    setHighlightLine(jumpLine || null);
    setIsEditingFile(false);

    if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(path)) {
      setRawFileContent(null);
      const blob = await file.async("blob");
      const url = URL.createObjectURL(blob);
      setFileImageUrl(url);
    } else {
      setFileImageUrl(null);
      try {
        const text = await file.async("text");
        setRawFileContent(text);
        setEditedCode(text);
      } catch {
        setRawFileContent("Binary or non-text file.");
      }
    }
  }

  // Save in-browser modified file back into active JSZip
  function handleSaveModifiedFile() {
    if (!zipInstance || !selectedFile) return;
    zipInstance.file(selectedFile, editedCode);
    setRawFileContent(editedCode);
    setIsEditingFile(false);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);

    // Update file cache for live re-scanning
    setAllExtractedFiles((prev) =>
      prev.map((f) => (f.path === selectedFile ? { ...f, text: editedCode } : f))
    );
  }

  async function performContentSearch(searchQuery: string) {
    if (!zipInstance || !searchQuery.trim()) {
      setContentSearchMatches([]);
      return;
    }
    setIsSearchingContent(true);
    const matches: SearchMatch[] = [];
    const qLower = searchQuery.toLowerCase();

    for (const entry of zipEntries) {
      if (entry.isDir) continue;
      if (!/\.(js|json|html|css|ts|jsx|tsx|md|txt|xml|yaml|yml)$/i.test(entry.path)) continue;

      const file = zipInstance.file(entry.path);
      if (!file) continue;

      try {
        const text = await file.async("text");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(qLower)) {
            matches.push({
              file: entry.path,
              line: i + 1,
              snippet: lines[i].trim().slice(0, 100)
            });
            if (matches.length >= 80) break;
          }
        }
      } catch {}
      if (matches.length >= 80) break;
    }

    setContentSearchMatches(matches);
    setIsSearchingContent(false);
  }

  async function runCustomRuleScan() {
    if (!zipInstance || !customRuleInput.trim()) return;
    setIsScanningCustomRule(true);
    setCustomRuleMatches([]);

    try {
      const regex = new RegExp(customRuleInput.trim(), "g");
      const matches: Array<{ file: string; line: number; snippet: string }> = [];

      for (const entry of zipEntries) {
        if (entry.isDir) continue;
        if (!/\.(js|json|html|css|ts|jsx|tsx)$/i.test(entry.path)) continue;

        const file = zipInstance.file(entry.path);
        if (!file) continue;

        const text = await file.async("text").catch(() => "");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            matches.push({
              file: entry.path,
              line: i + 1,
              snippet: lines[i].trim().slice(0, 120)
            });
            if (matches.length >= 100) break;
          }
        }
        if (matches.length >= 100) break;
      }
      setCustomRuleMatches(matches);
    } catch {
      alert("Invalid Regular Expression pattern.");
    } finally {
      setIsScanningCustomRule(false);
    }
  }

  function handleCopyHash(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedHashes((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedHashes((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  }

  function handleCopyCode() {
    if (!displayedCode) return;
    navigator.clipboard.writeText(displayedCode);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  }

  function handleDownloadSingleFile(path: string) {
    if (!zipInstance) return;
    const file = zipInstance.file(path);
    if (!file) return;

    file.async("blob").then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  }

  const fileTree = useMemo(() => buildFileTree(zipEntries), [zipEntries]);

  const displayedCode = useMemo(() => {
    if (!rawFileContent) return null;
    if (isBeautified && selectedFile) {
      return beautifyCode(rawFileContent, selectedFile);
    }
    return rawFileContent;
  }, [rawFileContent, isBeautified, selectedFile]);

  const filteredTreeNodes = useMemo(() => {
    if (!fileSearch.trim() || searchMode === "content") return fileTree;
    const q = fileSearch.toLowerCase();
    const matchedEntries = zipEntries.filter((e) => e.path.toLowerCase().includes(q));
    return buildFileTree(matchedEntries);
  }, [fileTree, fileSearch, searchMode, zipEntries]);

  const filteredNetworkEndpoints = useMemo(() => {
    if (!networkHarvest) return [];
    if (!networkFilter.trim()) return networkHarvest.endpoints;
    const q = networkFilter.toLowerCase();
    return networkHarvest.endpoints.filter(
      (ep) =>
        ep.url.toLowerCase().includes(q) ||
        ep.domain.toLowerCase().includes(q) ||
        ep.file.toLowerCase().includes(q)
    );
  }, [networkHarvest, networkFilter]);

  const filteredEncyclopedia = useMemo(() => {
    return PERMISSIONS_DATABASE.filter((doc) => {
      const matchesCat = encyclopediaCategory === "All" || doc.category === encyclopediaCategory;
      const matchesQuery =
        !encyclopediaSearch.trim() ||
        doc.name.toLowerCase().includes(encyclopediaSearch.toLowerCase()) ||
        doc.summary.toLowerCase().includes(encyclopediaSearch.toLowerCase()) ||
        doc.threatModel.toLowerCase().includes(encyclopediaSearch.toLowerCase());
      return matchesCat && matchesQuery;
    });
  }, [encyclopediaSearch, encyclopediaCategory]);

  return (
    <main
      className={`min-h-screen relative flex flex-col justify-between selection:bg-brass selection:text-ink transition-colors ${
        isDragging ? "ring-4 ring-brass ring-inset bg-surface/90" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleFileDrop}
    >
      <div className="noise" />

      {/* Top Navigation Bar */}
      <header className="border-b border-line px-6 py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <CrateMark />
          <div>
            <span className="font-display font-bold text-lg text-paper tracking-wide">
              GetCRX <span className="text-brass text-sm font-mono font-normal">/ Unpacked</span>
            </span>
            <p className="text-[10px] font-mono text-muted uppercase tracking-widest hidden sm:block">
              Browser Extension Extractor & Security Inspector
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          {meta && (
            <button
              onClick={handleCopyShareLink}
              title="Copy Direct Shareable Link"
              className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 text-paper transition-colors flex items-center gap-1.5"
            >
              {copiedShareLink ? <Check className="w-3.5 h-3.5 text-teal" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{copiedShareLink ? "Link Copied" : "Share"}</span>
            </button>
          )}

          <button
            onClick={() => setShowInstallGuide(true)}
            className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 text-paper transition-colors flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Install Guide</span>
          </button>

          <button
            onClick={() => setShowBookmarkletModal(true)}
            className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 text-paper transition-colors flex items-center gap-1.5"
          >
            <Bookmark className="w-3.5 h-3.5 text-teal" />
            <span className="hidden md:inline">Bookmarklet</span>
          </button>

          <button
            onClick={() => setShowEncyclopedia(true)}
            className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 text-paper transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-brass" />
            <span className="hidden md:inline">Permissions Doc</span>
          </button>

          <button
            onClick={() => setShowCommandPalette(true)}
            className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 text-paper transition-colors flex items-center gap-1.5"
          >
            <Command className="w-3.5 h-3.5 text-brass" />
            <span className="hidden sm:inline">Cmd+K</span>
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-7xl mx-auto w-full relative z-10">
        {/* Search Hero Box */}
        <section className="w-full max-w-2xl text-center space-y-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h1 className="font-display font-bold text-3xl sm:text-5xl text-paper tracking-tight">
              Unpack & Audit <span className="text-brass">Any Extension</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-2 max-w-md mx-auto">
              Extract source code, beautify minified scripts, harvest telemetry URLs, and audit security attack surfaces in real-time.
            </p>
          </motion.div>

          <form onSubmit={handleLookup} className="relative flex items-center mt-4">
            <Search className="w-4 h-4 text-muted absolute left-4 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste Chrome/Firefox Store URL or 32-char ID (e.g. uBlock, Dark Reader)..."
              className="w-full bg-surface border border-line rounded-xl pl-11 pr-28 py-3.5 text-sm text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass focus:ring-1 focus:ring-brass transition-all font-mono"
            />
            <button
              type="submit"
              disabled={status === "looking" || !query.trim()}
              className="absolute right-2 px-4 py-2 bg-brass text-ink font-semibold rounded-lg text-xs hover:bg-brassDim disabled:opacity-50 disabled:cursor-not-allowed transition-all font-mono flex items-center gap-1.5"
            >
              {status === "looking" ? (
                <>
                  <span className="w-3 h-3 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Looking...</span>
                </>
              ) : (
                <span>Look up</span>
              )}
            </button>
          </form>

          {/* Quick Shortcuts & Drop Hint */}
          <div className="flex items-center justify-between text-xs text-muted font-mono px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-muted/60">Try:</span>
              {POPULAR_EXTENSIONS.map((pop) => (
                <button
                  key={pop.id}
                  type="button"
                  onClick={() => {
                    setQuery(pop.id);
                    runLookup(pop.id);
                  }}
                  className="hover:text-brass text-[11px] underline underline-offset-2 transition-colors"
                >
                  {pop.name}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowIdGuide(true)}
              className="text-[11px] hover:text-paper flex items-center gap-1 text-teal underline underline-offset-2"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Where to find ID?</span>
            </button>
          </div>

          {/* Recent Audits History Bar */}
          {recentAudits.length > 0 && (
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-line/40 text-[11px] font-mono text-muted">
              <div className="flex items-center gap-1.5 truncate">
                <History className="w-3 h-3 text-brass shrink-0" />
                <span className="text-muted/80 shrink-0">Recent:</span>
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {recentAudits.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setQuery(item.id);
                        runLookup(item.id);
                      }}
                      className="px-2 py-0.5 rounded bg-surface2/60 hover:bg-surface2 hover:text-paper text-paper/80 border border-line text-[10px] truncate max-w-[120px]"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={clearRecentAudits}
                title="Clear History"
                className="hover:text-danger text-muted/60 p-1 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </section>

        {/* Error Alert */}
        {status === "error" && errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl mb-6 p-4 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs flex items-center gap-3 font-mono"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="flex-1">{errorMsg}</p>
          </motion.div>
        )}

        {/* Extension Inspection Workspace */}
        {meta && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-6xl space-y-6"
          >
            {/* Header Card with Icon & Metadata */}
            <div className="p-6 rounded-2xl border border-line bg-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
              <div className="flex items-start gap-4">
                {meta.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={meta.icon}
                    alt={meta.name || "Extension icon"}
                    className="w-16 h-16 rounded-xl border border-line bg-surface2 p-1.5 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-line bg-surface2 flex items-center justify-center text-muted shrink-0">
                    <Package className="w-8 h-8 text-brass" />
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display font-bold text-xl sm:text-2xl text-paper">
                      {meta.name || "Extension Archive"}
                    </h2>
                    {manifestData?.version && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface2 text-brass border border-line">
                        v{manifestData.version}
                      </span>
                    )}
                    {manifestData?.manifest_version && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface2 text-teal border border-line">
                        MV{manifestData.manifest_version}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted max-w-xl line-clamp-2">{meta.description}</p>
                  <p className="text-[11px] font-mono text-muted/70 flex items-center gap-2 pt-1">
                    <span>ID: {meta.id}</span>
                    <span>&bull;</span>
                    <span>{zipEntries.filter((e) => !e.isDir).length} files</span>
                    <span>&bull;</span>
                    <span>{bundleAnalytics.totalLOC.toLocaleString()} LOC</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
                <button
                  onClick={handleDownloadZip}
                  className="flex-1 md:flex-initial px-4 py-2.5 bg-brass text-ink font-semibold rounded-xl text-xs hover:bg-brassDim transition-all font-mono flex items-center justify-center gap-2 shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .ZIP</span>
                </button>

                <button
                  onClick={handleDownloadHardenedZip}
                  disabled={isHardeningDownload}
                  title="Strip broad permissions and download privacy-hardened zip"
                  className="px-3.5 py-2.5 bg-surface border border-teal/40 text-teal hover:bg-teal/10 rounded-xl text-xs transition-all font-mono flex items-center gap-1.5"
                >
                  <LockOpen className="w-4 h-4" />
                  <span>{isHardeningDownload ? "Hardening..." : "Hardened Zip"}</span>
                </button>

                <button
                  onClick={handleDownloadRawCrx}
                  title="Download raw signed CRX container directly from store CDN"
                  className="px-3.5 py-2.5 bg-surface border border-line hover:border-brass/50 text-paper rounded-xl text-xs transition-all font-mono flex items-center gap-1.5"
                >
                  <FileArchive className="w-4 h-4 text-brass" />
                  <span className="hidden sm:inline">Raw .CRX</span>
                </button>
              </div>
            </div>

            {/* Cryptographic Hashes & Fingerprints Bar */}
            {packageHashes && (
              <div className="p-3.5 rounded-xl border border-line bg-surface2/40 flex items-center justify-between gap-4 flex-wrap text-xs font-mono">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-[11px]">SHA-256:</span>
                    <span className="text-teal text-[11px] truncate max-w-[200px] sm:max-w-xs">{packageHashes.sha256}</span>
                    <button
                      onClick={() => handleCopyHash("sha256", packageHashes.sha256)}
                      className="text-muted hover:text-paper"
                      title="Copy SHA-256"
                    >
                      {copiedHashes.sha256 ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 hidden md:flex">
                    <span className="text-muted text-[11px]">MD5:</span>
                    <span className="text-brass text-[11px]">{packageHashes.md5}</span>
                    <button
                      onClick={() => handleCopyHash("md5", packageHashes.md5)}
                      className="text-muted hover:text-paper"
                      title="Copy MD5"
                    >
                      {copiedHashes.md5 ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-surface border border-line text-[10px] text-muted">
                    {bundleAnalytics.riskCategoryBadge} ({bundleAnalytics.storeRiskPercentile}th percentile)
                  </span>
                </div>
              </div>
            )}

            {/* Workspace Tab Navigation */}
            <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-2xl">
              <div className="border-b border-line flex items-center px-4 overflow-x-auto text-xs font-mono bg-surface2/40">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "overview"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Overview & Permissions</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("explorer");
                    if (!selectedFile && zipEntries.length > 0) {
                      const firstCode = zipEntries.find((e) => !e.isDir);
                      if (firstCode) handleSelectFile(firstCode.path);
                    }
                  }}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "explorer"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Code className="w-4 h-4 text-teal" />
                  <span>Code Explorer & De-Minifier</span>
                </button>

                <button
                  onClick={() => setActiveTab("security")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "security"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 text-danger" />
                  <span>Security, Secrets & Forensics</span>
                  {securityScan && (securityScan.summary.critical > 0 || securityScan.summary.high > 0) && (
                    <span className="px-1.5 py-0.2 rounded-full bg-danger/20 text-danger text-[10px] font-mono border border-danger/30">
                      {securityScan.summary.critical + securityScan.summary.high}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("csp")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "csp"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>CSP & Attack Surface</span>
                </button>

                <button
                  onClick={() => setActiveTab("network")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "network"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Radio className="w-4 h-4 text-teal" />
                  <span>Network Endpoints ({networkHarvest ? networkHarvest.uniqueDomains.length : "..."})</span>
                </button>

                <button
                  onClick={() => setActiveTab("assets")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "assets"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <span>Asset Gallery ({mediaAssets.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab("analytics")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "analytics"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <PieChart className="w-4 h-4 text-teal" />
                  <span>Bundle & Metrics</span>
                </button>

                <button
                  onClick={() => setActiveTab("enterprise")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "enterprise"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Building className="w-4 h-4 text-brass" />
                  <span>Enterprise & Policies</span>
                </button>

                <button
                  onClick={() => setActiveTab("diff")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "diff"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <GitCompare className="w-4 h-4 text-amber-400" />
                  <span>Version Diff</span>
                </button>

                <button
                  onClick={() => setActiveTab("mv3")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "mv3"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>MV3 Health</span>
                </button>
              </div>

              {/* Tab 1: Overview & Threat Intel Links */}
              {activeTab === "overview" && (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Manifest Architecture</p>
                      <p className="text-xl font-bold font-display text-paper mt-1">
                        {manifestData?.manifest_version ? `Manifest V${manifestData.manifest_version}` : isUnpacking ? "Analyzing..." : "MV3 Active"}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {manifestData?.manifest_version === 3
                          ? "Modern MV3 architecture (Service Worker)"
                          : "Legacy Manifest V2 format (Phase-out)"}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Unpacked Files</p>
                      <p className="text-xl font-bold font-display text-paper mt-1">
                        {isUnpacking ? "Extracting..." : `${zipEntries.filter((e) => !e.isDir).length} files`}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Total {bundleAnalytics.totalLOC.toLocaleString()} source lines across all modules
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Security Health Grade</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className={`text-2xl font-black font-display px-2.5 py-0.5 rounded ${
                            securityScan?.grade === "A+" || securityScan?.grade === "A"
                              ? "bg-teal/20 text-teal border border-teal/40"
                              : securityScan?.grade === "B" || securityScan?.grade === "C"
                              ? "bg-amber-400/20 text-amber-400 border border-amber-400/40"
                              : "bg-danger/20 text-danger border border-danger/40"
                          }`}
                        >
                          {securityScan ? securityScan.grade : "A+"}
                        </span>
                        <div>
                          <p className="text-xs text-paper font-semibold">
                            {securityScan?.grade === "A+" || securityScan?.grade === "A"
                              ? "Clean Posture"
                              : "Review Findings"}
                          </p>
                          <p className="text-[11px] text-muted font-mono">
                            {securityScan ? `${securityScan.summary.critical + securityScan.summary.high} High-risk flags` : "Scanning..."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Permissions Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-semibold text-paper text-sm flex items-center gap-2">
                        <Key className="w-4 h-4 text-brass" />
                        <span>Declared Extension Permissions</span>
                      </h3>
                      <button
                        onClick={() => setShowEncyclopedia(true)}
                        className="text-xs text-brass hover:underline flex items-center gap-1 font-mono"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Open Permissions Encyclopedia</span>
                      </button>
                    </div>

                    {manifestData?.permissions || manifestData?.host_permissions ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {[
                          ...(manifestData.permissions || []),
                          ...(manifestData.host_permissions || [])
                        ].map((perm: string, idx: number) => {
                          const detail = classifyPermission(perm);
                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-xl border text-xs font-mono space-y-1 transition-all ${
                                detail.level === "high"
                                  ? "border-danger/40 bg-danger/5 text-danger"
                                  : detail.level === "medium"
                                  ? "border-amber-400/30 bg-amber-400/5 text-amber-300"
                                  : "border-line bg-surface2 text-paper"
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className="truncate">{perm}</span>
                                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-current">
                                  {detail.level}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted font-sans line-clamp-2">{detail.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No declared API permissions (Zero-privilege extension).</p>
                    )}
                  </div>

                  {/* Threat Intel & Deep Links */}
                  <div className="p-4 rounded-xl border border-line bg-surface2/30 flex items-center justify-between gap-4 flex-wrap text-xs">
                    <div className="space-y-1">
                      <p className="text-muted font-mono text-[11px]">Threat Intelligence & Store Lookups:</p>
                      <div className="flex items-center gap-3 font-mono flex-wrap">
                        <a
                          href={`https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(
                            meta.id.length === 32
                              ? `https://chromewebstore.google.com/detail/${meta.id}`
                              : `https://addons.mozilla.org/en-US/firefox/addon/${meta.id}/`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal hover:underline flex items-center gap-1"
                        >
                          <span>Google Safe Browsing</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {meta.id.length === 32 ? (
                          <a
                            href={`https://chrome-stats.com/d/${encodeURIComponent(meta.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brass hover:underline flex items-center gap-1"
                          >
                            <span>Chrome-Stats</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null}
                        <a
                          href={
                            meta.id.length === 32
                              ? `https://chromewebstore.google.com/detail/${meta.id}`
                              : `https://addons.mozilla.org/en-US/firefox/addon/${meta.id}/`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-paper hover:underline flex items-center gap-1"
                        >
                          <span>Store Listing</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExportSecurityReport}
                        disabled={!securityScan}
                        className="px-3 py-2 rounded-lg bg-surface border border-line text-paper hover:bg-surface2 transition-colors flex items-center gap-1.5 text-xs font-mono"
                      >
                        <FileDown className="w-3.5 h-3.5 text-teal" />
                        <span>Export Audit (.md)</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab("explorer");
                          if (!selectedFile && zipEntries.length > 0) {
                            const firstCode = zipEntries.find((e) => !e.isDir);
                            if (firstCode) handleSelectFile(firstCode.path);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-brass text-ink font-semibold hover:bg-brassDim transition-colors flex items-center gap-1.5 text-xs font-mono"
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Explore Source Code</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Code Explorer with Beautifier, Resizer & Live In-Memory Modifier */}
              {activeTab === "explorer" && (
                <div className={`grid grid-cols-1 md:grid-cols-12 ${isFullscreenCode ? "fixed inset-0 z-50 bg-ink p-4" : "min-h-[560px]"}`}>
                  {/* Left Column: File Tree & Search */}
                  <div className="md:col-span-4 border-r border-line bg-surface2/30 flex flex-col">
                    <div className="p-3 border-b border-line space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={fileSearch}
                          onChange={(e) => {
                            setFileSearch(e.target.value);
                            if (searchMode === "content") performContentSearch(e.target.value);
                          }}
                          placeholder={searchMode === "path" ? "Filter files by path..." : "Search inside all files..."}
                          className="w-full bg-surface border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass/70 font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSearchMode("path");
                              setContentSearchMatches([]);
                            }}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              searchMode === "path" ? "bg-brass/20 text-brass border border-brass/40" : "hover:text-paper"
                            }`}
                          >
                            Paths
                          </button>
                          <button
                            onClick={() => {
                              setSearchMode("content");
                              if (fileSearch) performContentSearch(fileSearch);
                            }}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              searchMode === "content" ? "bg-brass/20 text-brass border border-brass/40" : "hover:text-paper"
                            }`}
                          >
                            Full-Text
                          </button>
                        </div>

                        {searchMode === "path" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setViewMode("tree")}
                              title="Tree View"
                              className={`p-1 rounded ${viewMode === "tree" ? "text-brass" : "text-muted hover:text-paper"}`}
                            >
                              <FolderTree className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setViewMode("flat")}
                              title="Flat List View"
                              className={`p-1 rounded ${viewMode === "flat" ? "text-brass" : "text-muted hover:text-paper"}`}
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Content Search Results or File Tree */}
                    <div className="flex-1 overflow-y-auto max-h-[520px] p-2 space-y-0.5">
                      {isUnpacking ? (
                        <div className="p-8 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
                          <span className="w-5 h-5 border-2 border-brass border-t-transparent rounded-full animate-spin" />
                          <span>Unpacking source...</span>
                        </div>
                      ) : unpackError ? (
                        <div className="p-4 text-xs text-danger text-center">
                          <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-danger" />
                          <p>{unpackError}</p>
                          <button onClick={() => loadZipData(meta.id)} className="mt-2 text-brass underline text-[11px]">
                            Retry extraction
                          </button>
                        </div>
                      ) : searchMode === "content" ? (
                        <div className="space-y-1.5 p-1">
                          {isSearchingContent ? (
                            <div className="p-4 text-center text-xs text-muted">Searching through files...</div>
                          ) : contentSearchMatches.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted">
                              {fileSearch ? "No code matches found." : "Type a query above to search code."}
                            </div>
                          ) : (
                            contentSearchMatches.map((m, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSelectFile(m.file, m.line)}
                                className="w-full p-2 rounded text-left text-xs bg-surface border border-line hover:border-brass/40 transition-colors font-mono"
                              >
                                <div className="flex items-center justify-between text-[11px] text-brass font-semibold">
                                  <span className="truncate">{m.file}</span>
                                  <span>L{m.line}</span>
                                </div>
                                <p className="text-[10px] text-muted truncate mt-1">{m.snippet}</p>
                              </button>
                            ))
                          )}
                        </div>
                      ) : viewMode === "tree" ? (
                        <RenderTreeNodes
                          nodes={filteredTreeNodes}
                          selectedFile={selectedFile}
                          expandedFolders={expandedFolders}
                          onToggleFolder={toggleFolder}
                          onSelectFile={handleSelectFile}
                        />
                      ) : (
                        <div className="space-y-0.5">
                          {zipEntries
                            .filter((e) => !e.isDir)
                            .map((entry) => (
                              <button
                                key={entry.path}
                                onClick={() => handleSelectFile(entry.path)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono truncate transition-colors flex items-center justify-between ${
                                  selectedFile === entry.path
                                    ? "bg-brass/20 text-brass border border-brass/30"
                                    : "text-muted hover:text-paper hover:bg-surface/50"
                                }`}
                              >
                                <span className="truncate">{entry.path}</span>
                                <span className="text-[10px] text-muted/60">{(entry.size / 1024).toFixed(1)}k</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Code Viewer / Modifier */}
                  <div className="md:col-span-8 flex flex-col bg-surface overflow-hidden">
                    {selectedFile ? (
                      <>
                        <div className="p-3 border-b border-line bg-surface2/60 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-paper truncate font-medium">{selectedFile}</span>
                            {highlightLine && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                Line {highlightLine}
                              </span>
                            )}
                            {saveSuccessMsg && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal/20 text-teal border border-teal/40">
                                Saved in memory!
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                            {/* Live Edit Toggle */}
                            <button
                              onClick={() => setIsEditingFile(!isEditingFile)}
                              className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
                                isEditingFile ? "bg-brass text-ink border-brass" : "bg-surface border-line text-muted hover:text-paper"
                              }`}
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{isEditingFile ? "Editing" : "Edit"}</span>
                            </button>

                            {isEditingFile && (
                              <button
                                onClick={handleSaveModifiedFile}
                                className="px-2.5 py-1 rounded bg-teal text-ink font-semibold flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            )}

                            {/* Beautify Button */}
                            <button
                              onClick={() => setIsBeautified(!isBeautified)}
                              disabled={isEditingFile}
                              className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors ${
                                isBeautified ? "bg-teal/20 text-teal border-teal/40" : "bg-surface border-line text-muted hover:text-paper"
                              }`}
                            >
                              <Sparkles className="w-3 h-3 text-teal" />
                              <span>{isBeautified ? "Beautified" : "Beautify"}</span>
                            </button>

                            {/* Wrap Button */}
                            <button
                              onClick={() => setWrapLines(!wrapLines)}
                              className={`px-2 py-1 rounded border flex items-center gap-1 ${
                                wrapLines ? "bg-brass/20 text-brass border-brass/40" : "bg-surface border-line text-muted hover:text-paper"
                              }`}
                            >
                              <WrapText className="w-3 h-3" />
                              <span>Wrap</span>
                            </button>

                            {/* Fullscreen Button */}
                            <button
                              onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                              className="px-2 py-1 rounded bg-surface border border-line text-muted hover:text-paper flex items-center gap-1"
                            >
                              {isFullscreenCode ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                            </button>

                            {displayedCode && (
                              <button
                                onClick={handleCopyCode}
                                className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper flex items-center gap-1"
                              >
                                {copiedFile ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedFile ? "Copied" : "Copy"}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDownloadSingleFile(selectedFile)}
                              className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-auto max-h-[540px] bg-ink/50 p-2">
                          {fileImageUrl ? (
                            <div className="flex flex-col items-center justify-center p-8">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fileImageUrl}
                                alt=""
                                className="max-w-[220px] max-h-[220px] rounded border border-line bg-surface p-2 object-contain shadow-lg"
                              />
                              <p className="mt-3 text-xs text-muted font-mono">{selectedFile}</p>
                            </div>
                          ) : isEditingFile ? (
                            <textarea
                              value={editedCode}
                              onChange={(e) => setEditedCode(e.target.value)}
                              className="w-full h-[500px] bg-ink text-paper font-mono text-xs p-3 focus:outline-none resize-none border border-line rounded"
                              spellCheck={false}
                            />
                          ) : displayedCode !== null ? (
                            <CodeViewer
                              code={displayedCode}
                              filename={selectedFile}
                              highlightLine={highlightLine}
                              wrapLines={wrapLines}
                            />
                          ) : (
                            <div className="p-8 text-center text-xs text-muted">Loading file contents...</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted">
                        <FileCode className="w-12 h-12 text-muted/40 mb-3" />
                        <p className="text-sm font-medium text-paper">Select a file to inspect</p>
                        <p className="text-xs text-muted max-w-xs mt-1">
                          Click any file from the tree on the left to read code, examine JSON structures, or preview assets.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Security, Hardcoded Secrets & Forensics */}
              {activeTab === "security" && (
                <div className="p-6 space-y-6">
                  {/* Custom Regex Rule Scanner */}
                  <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-paper font-mono flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-brass" />
                        <span>Custom Regular Expression Code Auditor</span>
                      </p>
                      <span className="text-[10px] text-muted font-mono">Scan across all unpacked files</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customRuleInput}
                        onChange={(e) => setCustomRuleInput(e.target.value)}
                        placeholder="e.g. internal\.api\.com|AUTH_TOKEN|sk_live_[0-9a-zA-Z]+"
                        className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-xs font-mono text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass"
                      />
                      <button
                        onClick={runCustomRuleScan}
                        disabled={isScanningCustomRule || !customRuleInput.trim()}
                        className="px-4 py-2 rounded-lg bg-brass text-ink font-mono font-semibold text-xs hover:bg-brassDim disabled:opacity-50"
                      >
                        {isScanningCustomRule ? "Scanning..." : "Execute Scan"}
                      </button>
                    </div>

                    {customRuleMatches.length > 0 && (
                      <div className="pt-2 space-y-1.5 max-h-48 overflow-y-auto">
                        <p className="text-[11px] font-mono text-teal">
                          Found {customRuleMatches.length} matching occurrences:
                        </p>
                        {customRuleMatches.map((m, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setActiveTab("explorer");
                              handleSelectFile(m.file, m.line);
                            }}
                            className="p-2 rounded bg-surface border border-line hover:border-brass/40 cursor-pointer font-mono text-xs flex items-center justify-between gap-4"
                          >
                            <span className="text-paper truncate">
                              {m.file}:{m.line}
                            </span>
                            <span className="text-muted text-[10px] truncate max-w-sm">{m.snippet}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Shannon Entropy & Obfuscation Analysis */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-amber-400" />
                      <span>Script Entropy & Obfuscation Detector</span>
                    </h3>

                    {obfuscationFindings.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {obfuscationFindings.map((ob, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setActiveTab("explorer");
                              handleSelectFile(ob.file);
                            }}
                            className="p-3.5 rounded-xl border border-line bg-surface2/40 cursor-pointer hover:border-brass/40 transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-paper truncate">{ob.file}</span>
                              <span className="text-brass font-semibold">{ob.entropy} bits/char</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              {ob.indicators.map((ind, i) => (
                                <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                                  {ind}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No suspicious obfuscation or packed eval scripts detected.</p>
                    )}
                  </div>

                  {/* Privacy & Hardware APIs */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Radio className="w-4 h-4 text-teal" />
                      <span>Hardware & Privacy API Calls</span>
                    </h3>

                    {privacyApis.length > 0 ? (
                      <div className="space-y-2">
                        {privacyApis.map((p, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setActiveTab("explorer");
                              handleSelectFile(p.file, p.line);
                            }}
                            className="p-3 rounded-xl border border-line bg-surface2/40 cursor-pointer hover:border-brass/40 flex items-center justify-between gap-4 font-mono text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-danger font-bold">{p.api}</span>
                                <span className="text-muted text-[11px]">&bull;</span>
                                <span className="text-paper">{p.file}:{p.line}</span>
                              </div>
                              <p className="text-[11px] text-muted font-sans">{p.threat}</p>
                            </div>
                            <code className="text-[10px] text-amber-300 bg-surface px-2 py-1 rounded border border-line shrink-0">
                              {p.symbol}
                            </code>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No camera, microphone, WebRTC, or geolocation APIs called.</p>
                    )}
                  </div>

                  {/* Local Storage & Cookie Forensics */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Database className="w-4 h-4 text-brass" />
                      <span>Storage & Cookie Key Forensics</span>
                    </h3>

                    {storageForensics.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {storageForensics.map((sf, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setActiveTab("explorer");
                              handleSelectFile(sf.file, sf.line);
                            }}
                            className="p-2.5 rounded-lg border border-line bg-surface2/30 cursor-pointer hover:border-brass/40 font-mono text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-teal font-bold truncate">{sf.key}</span>
                              <span className="text-[9px] text-muted uppercase">{sf.type}</span>
                            </div>
                            <p className="text-[10px] text-muted truncate">{sf.file}:{sf.line}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No direct storage key access detected.</p>
                    )}
                  </div>

                  {/* Automated Security Findings */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brass" />
                      <span>Automated Security Findings ({securityScan ? securityScan.findings.length : 0})</span>
                    </h3>

                    {securityScan && securityScan.findings.length > 0 ? (
                      <div className="space-y-2.5">
                        {securityScan.findings.map((f, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              if (f.file) {
                                setActiveTab("explorer");
                                handleSelectFile(f.file, f.line);
                              }
                            }}
                            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                              f.severity === "critical"
                                ? "border-danger/40 bg-danger/10 text-danger hover:border-danger"
                                : f.severity === "high"
                                ? "border-danger/30 bg-danger/5 text-danger hover:border-danger"
                                : f.severity === "medium"
                                ? "border-amber-400/30 bg-amber-400/5 text-amber-300 hover:border-amber-400"
                                : "border-line bg-surface2 text-paper hover:border-brass/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 font-mono">
                              <span className="font-bold">{f.title}</span>
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border border-current">
                                {f.severity}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted font-sans mt-1 leading-relaxed">{f.description}</p>
                            {f.file && (
                              <p className="text-[10px] font-mono text-muted/80 mt-1.5">
                                Source: {f.file}{f.line ? `:${f.line}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-line bg-surface2/30 text-center font-mono text-xs text-teal">
                        ✓ No critical vulnerabilities or secret leaks detected.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Content Security Policy & Attack Surface */}
              {activeTab === "csp" && (
                <div className="p-6 space-y-6">
                  {/* CSP Evaluator Card */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Lock className="w-4 h-4 text-brass" />
                      <span>Content Security Policy (CSP) Evaluator</span>
                    </h3>

                    {cspReport ? (
                      <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-3">
                        <div className="flex items-center justify-between font-mono text-xs">
                          <span className="text-muted">CSP Format: {cspReport.isMV3 ? "MV3 Dictionary Object" : "MV2 String"}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              cspReport.overallRisk === "high"
                                ? "bg-danger/20 text-danger border border-danger/30"
                                : cspReport.overallRisk === "medium"
                                ? "bg-amber-400/20 text-amber-400 border border-amber-400/30"
                                : "bg-teal/20 text-teal border border-teal/30"
                            }`}
                          >
                            {cspReport.overallRisk} Risk
                          </span>
                        </div>

                        <div className="space-y-2">
                          {cspReport.directives.map((dir, idx) => (
                            <div key={idx} className="p-2.5 rounded bg-surface border border-line font-mono text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-brass font-bold">{dir.name}</span>
                                <span className="text-[10px] text-muted">{dir.risk}</span>
                              </div>
                              <p className="text-[11px] text-paper truncate">{dir.values.join(" ")}</p>
                              {dir.reason && <p className="text-[10px] text-danger">{dir.reason}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No explicit CSP declared (Default Chromium sandbox applied).</p>
                    )}
                  </div>

                  {/* Content Scripts Map */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-teal" />
                      <span>Injected Content Scripts ({contentScripts.length})</span>
                    </h3>

                    {contentScripts.length > 0 ? (
                      <div className="space-y-2.5">
                        {contentScripts.map((cs, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl border border-line bg-surface2/40 space-y-2 font-mono text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-brass font-bold">Matches: {cs.matches.join(", ")}</span>
                              <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded border border-line">
                                Run at: {cs.runAt}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted flex items-center gap-4 flex-wrap">
                              <span>Scripts: {cs.js?.join(", ") || "None"}</span>
                              <span>Styles: {cs.css?.join(", ") || "None"}</span>
                              <span>All Frames: {cs.allFrames ? "Yes" : "No"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No content scripts injected into web pages.</p>
                    )}
                  </div>

                  {/* Web Accessible Resources */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Globe className="w-4 h-4 text-amber-400" />
                      <span>Web Accessible Resources (WAR)</span>
                    </h3>

                    {warEntries.length > 0 ? (
                      <div className="space-y-2">
                        {warEntries.map((war, idx) => (
                          <div key={idx} className="p-3 rounded-xl border border-line bg-surface2/40 font-mono text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-paper truncate">Files: {war.resources.join(", ")}</span>
                              {war.isWildcard && (
                                <span className="text-[10px] bg-danger/20 text-danger border border-danger/30 px-1.5 py-0.5 rounded">
                                  Wildcard Exposed
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted">Accessible by: {war.matches?.join(", ") || "Any origin"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No resources exposed to external web pages.</p>
                    )}
                  </div>

                  {/* Externally Connectable & Native Messaging */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-brass" />
                      <span>External Messaging & Native Host Privileges</span>
                    </h3>

                    <div className="p-4 rounded-xl border border-line bg-surface2/40 font-mono text-xs space-y-2">
                      <p className="text-paper">{externalMessaging.threatSummary}</p>
                      {externalMessaging.matches.length > 0 && (
                        <p className="text-[11px] text-muted">Allowed Domains: {externalMessaging.matches.join(", ")}</p>
                      )}
                      {externalMessaging.hasNativeMessaging && (
                        <p className="text-[11px] text-danger">⚠️ Extension has nativeMessaging permission to run local OS binaries.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Network Endpoints & Telemetry Harvester */}
              {activeTab === "network" && (
                <div className="p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display font-semibold text-paper text-sm flex items-center gap-2">
                        <Radio className="w-4 h-4 text-teal" />
                        <span>Harvested Network Endpoints & Domains</span>
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        Extracted {networkHarvest ? networkHarvest.endpoints.length : 0} external URLs across all scripts.
                      </p>
                    </div>

                    <input
                      type="text"
                      value={networkFilter}
                      onChange={(e) => setNetworkFilter(e.target.value)}
                      placeholder="Filter domain or URL..."
                      className="bg-surface border border-line rounded-lg px-3 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass font-mono w-full sm:w-64"
                    />
                  </div>

                  {/* Unique Domains Chips */}
                  {networkHarvest && networkHarvest.uniqueDomains.length > 0 && (
                    <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-2">
                      <p className="text-[11px] font-mono text-muted uppercase">
                        Discovered External Domains ({networkHarvest.uniqueDomains.length})
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {networkHarvest.uniqueDomains.map((dom, i) => (
                          <span
                            key={i}
                            onClick={() => setNetworkFilter(dom)}
                            className="px-2.5 py-1 rounded-md bg-surface border border-line text-brass hover:border-brass cursor-pointer font-mono text-xs transition-colors"
                          >
                            {dom}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Endpoints Table */}
                  <div className="border border-line rounded-xl overflow-hidden">
                    <div className="max-h-[440px] overflow-y-auto">
                      {filteredNetworkEndpoints.length > 0 ? (
                        <table className="w-full text-left border-collapse text-xs font-mono">
                          <thead>
                            <tr className="bg-surface2 border-b border-line text-muted text-[11px]">
                              <th className="p-3">Protocol</th>
                              <th className="p-3">Domain / Host</th>
                              <th className="p-3">Full URL</th>
                              <th className="p-3">Source File</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {filteredNetworkEndpoints.map((ep, idx) => (
                              <tr key={idx} className="hover:bg-surface2/50 transition-colors">
                                <td className="p-3 font-semibold text-teal">{ep.protocol.toUpperCase()}</td>
                                <td className="p-3 text-paper font-bold">{ep.domain}</td>
                                <td className="p-3 text-muted truncate max-w-xs">{ep.url}</td>
                                <td className="p-3">
                                  <button
                                    onClick={() => {
                                      setActiveTab("explorer");
                                      handleSelectFile(ep.file, ep.line);
                                    }}
                                    className="text-brass hover:underline truncate max-w-[160px] text-left"
                                  >
                                    {ep.file}:{ep.line}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-8 text-center text-xs text-muted font-mono">
                          No external HTTP/HTTPS/WSS network endpoints found in scripts.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 6: Media & Icon Asset Gallery */}
              {activeTab === "assets" && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-semibold text-paper text-sm flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-amber-400" />
                        <span>Visual Asset & Icon Gallery</span>
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        Preview all {mediaAssets.length} image and SVG assets embedded in the package.
                      </p>
                    </div>
                  </div>

                  {mediaAssets.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {mediaAssets.map((asset, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-line bg-surface2/40 flex flex-col items-center justify-between gap-2 hover:border-brass/40 transition-colors group"
                        >
                          <div className="w-20 h-20 flex items-center justify-center p-2 rounded bg-surface border border-line">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain" />
                          </div>
                          <div className="text-center w-full">
                            <p className="text-[11px] font-mono font-medium text-paper truncate">{asset.name}</p>
                            <p className="text-[9px] font-mono text-muted">{(asset.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            onClick={() => handleDownloadSingleFile(asset.path)}
                            className="w-full py-1 text-[10px] font-mono rounded bg-surface border border-line text-muted group-hover:text-paper group-hover:border-brass/40 flex items-center justify-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted font-mono">No visual image or SVG files found in package.</p>
                  )}
                </div>
              )}

              {/* Tab 7: Bundle & Code Metrics */}
              {activeTab === "analytics" && (
                <div className="p-6 space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Total Lines of Code</p>
                      <p className="text-2xl font-bold font-display text-brass mt-1">
                        {bundleAnalytics.totalLOC.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted mt-1">Source lines across all files</p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Total Unpacked Size</p>
                      <p className="text-2xl font-bold font-display text-teal mt-1">
                        {(bundleAnalytics.totalBytes / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-muted mt-1">{bundleAnalytics.totalFiles} files in archive</p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Store Category Benchmark</p>
                      <p className="text-2xl font-bold font-display text-paper mt-1">
                        {bundleAnalytics.storeRiskPercentile}th %
                      </p>
                      <p className="text-xs text-muted mt-1">{bundleAnalytics.riskCategoryBadge}</p>
                    </div>
                  </div>

                  {/* File Composition Distribution Bar */}
                  <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-3">
                    <p className="text-xs font-semibold text-paper font-mono">Bundle File Composition</p>
                    <div className="h-4 w-full rounded-full overflow-hidden flex bg-surface border border-line">
                      {bundleAnalytics.typeStats.map((st, i) => (
                        <div
                          key={i}
                          style={{ width: `${st.percentage}%`, backgroundColor: st.color }}
                          title={`${st.type}: ${st.percentage}%`}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                      {bundleAnalytics.typeStats.map((st, i) => (
                        <div key={i} className="flex items-center gap-2 font-mono text-xs">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                          <span className="text-muted truncate">{st.type}:</span>
                          <span className="text-paper font-bold">{st.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Largest Files Ranking */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display">Top 5 Largest Files in Package</h3>
                    <div className="space-y-2 font-mono text-xs">
                      {bundleAnalytics.largestFiles.map((lf, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setActiveTab("explorer");
                            handleSelectFile(lf.path);
                          }}
                          className="p-3 rounded-lg border border-line bg-surface2/30 cursor-pointer hover:border-brass/40 flex items-center justify-between gap-4"
                        >
                          <span className="text-paper truncate">{lf.path}</span>
                          <span className="text-brass font-bold">{lf.sizeFormatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 8: Enterprise & Policies */}
              {activeTab === "enterprise" && (
                <div className="p-6 space-y-6">
                  {/* Enterprise Policy JSON & Windows Registry Snippet */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Building className="w-4 h-4 text-brass" />
                      <span>Chrome / Edge Enterprise Policy Generator</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                      <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-brass font-bold">ExtensionSettings (JSON)</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(enterprisePolicies.extensionSettingsJson);
                              alert("Copied Policy JSON!");
                            }}
                            className="text-muted hover:text-paper"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <pre className="p-3 rounded bg-ink border border-line text-[11px] overflow-x-auto text-paper">
                          {enterprisePolicies.extensionSettingsJson}
                        </pre>
                      </div>

                      <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-teal font-bold">Windows Registry (.reg)</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(enterprisePolicies.windowsRegistryReg);
                              alert("Copied Windows Registry Script!");
                            }}
                            className="text-muted hover:text-paper"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <pre className="p-3 rounded bg-ink border border-line text-[11px] overflow-x-auto text-paper">
                          {enterprisePolicies.windowsRegistryReg}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* Bundled Open Source Libraries (SCA) */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <Package className="w-4 h-4 text-teal" />
                      <span>Detected Third-Party Libraries (SCA)</span>
                    </h3>

                    {detectedLibraries.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-xs">
                        {detectedLibraries.map((lib, i) => (
                          <div key={i} className="p-3 rounded-lg border border-line bg-surface2/40 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-brass font-bold">{lib.name}</span>
                              <span className="text-[10px] text-muted">{lib.category}</span>
                            </div>
                            <p className="text-[10px] text-muted truncate">Found in: {lib.file}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No standard third-party frameworks detected (Vanilla implementation).</p>
                    )}
                  </div>

                  {/* Open Source Licenses & Copyrights */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-paper font-display flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-amber-400" />
                      <span>License & Copyright Notice Harvester</span>
                    </h3>

                    {licenseFindings.length > 0 ? (
                      <div className="space-y-2 font-mono text-xs">
                        {licenseFindings.map((lic, i) => (
                          <div key={i} className="p-3 rounded-lg border border-line bg-surface2/40 flex items-center justify-between gap-4">
                            <div>
                              <span className="text-teal font-bold">{lic.type}</span>
                              <p className="text-[11px] text-muted truncate">{lic.snippet}</p>
                            </div>
                            <span className="text-[10px] text-muted">{lic.file}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted font-mono">No SPDX or dedicated license files detected.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 9: CRX Package Diff & Comparison Tool */}
              {activeTab === "diff" && (
                <div className="p-6 space-y-6">
                  {/* Upload Dropzones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-brass/40 bg-brass/5 space-y-2">
                      <p className="text-xs font-mono font-bold text-brass uppercase">Package A (Current Active)</p>
                      <p className="text-sm font-bold text-paper truncate">{meta.name || meta.id}</p>
                      <p className="text-xs text-muted font-mono">{zipEntries.filter((e) => !e.isDir).length} files loaded</p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/40 flex flex-col items-center justify-center text-center space-y-2 relative">
                      <p className="text-xs font-mono font-bold text-paper uppercase">Package B (Compare Target)</p>
                      {metaB ? (
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-teal truncate">{metaB.name || metaB.id}</p>
                          <p className="text-xs text-muted font-mono">Ready for comparison</p>
                        </div>
                      ) : (
                        <label className="cursor-pointer px-4 py-2 bg-surface border border-line hover:border-brass text-paper rounded-lg text-xs font-mono transition-colors">
                          <span>{isDiffing ? "Loading..." : "Drop or Upload .CRX / .ZIP"}</span>
                          <input
                            type="file"
                            accept=".crx,.zip,.xpi"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadPackageB(f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Diff Analysis Results */}
                  {diffResult && (
                    <div className="space-y-6">
                      {/* Permission Escalation Delta */}
                      <div className="p-4 rounded-xl border border-line bg-surface2/40 space-y-3">
                        <p className="text-xs font-bold text-paper font-mono flex items-center gap-2">
                          <Key className="w-4 h-4 text-brass" />
                          <span>Permission Escalation & Changes</span>
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                          <div className="p-3 rounded bg-surface border border-line space-y-1">
                            <span className="text-[10px] text-danger font-bold uppercase">
                              + Added ({diffResult.permissionChanges.added.length})
                            </span>
                            <p className="text-paper truncate">
                              {diffResult.permissionChanges.added.join(", ") || "None"}
                            </p>
                          </div>

                          <div className="p-3 rounded bg-surface border border-line space-y-1">
                            <span className="text-[10px] text-teal font-bold uppercase">
                              - Removed ({diffResult.permissionChanges.removed.length})
                            </span>
                            <p className="text-muted truncate">
                              {diffResult.permissionChanges.removed.join(", ") || "None"}
                            </p>
                          </div>

                          <div className="p-3 rounded bg-surface border border-line space-y-1">
                            <span className="text-[10px] text-muted font-bold uppercase">
                              = Retained ({diffResult.permissionChanges.unchanged.length})
                            </span>
                            <p className="text-muted truncate">
                              {diffResult.permissionChanges.unchanged.length} permissions
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* File Diff Viewer */}
                      <div className="grid grid-cols-1 md:grid-cols-12 border border-line rounded-xl overflow-hidden min-h-[400px]">
                        <div className="md:col-span-4 border-r border-line bg-surface2/30 p-2 space-y-1 max-h-[460px] overflow-y-auto font-mono text-xs">
                          <p className="p-2 text-[10px] text-muted uppercase font-bold">File Changes ({diffResult.fileChanges.length})</p>
                          {diffResult.fileChanges.map((fc, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSelectDiffFile(fc.path)}
                              className={`w-full text-left p-2 rounded flex items-center justify-between gap-2 ${
                                selectedDiffFile === fc.path ? "bg-brass/20 text-brass border border-brass/30" : "text-muted hover:text-paper hover:bg-surface"
                              }`}
                            >
                              <span className="truncate">{fc.path}</span>
                              <span
                                className={`text-[10px] font-bold uppercase ${
                                  fc.status === "added"
                                    ? "text-teal"
                                    : fc.status === "removed"
                                    ? "text-danger"
                                    : "text-amber-400"
                                }`}
                              >
                                {fc.status}
                              </span>
                            </button>
                          ))}
                        </div>

                        <div className="md:col-span-8 p-3 bg-ink overflow-auto max-h-[460px]">
                          {diffLines ? (
                            <DiffCodeViewer diffLines={diffLines} filename={selectedDiffFile || ""} />
                          ) : (
                            <div className="p-8 text-center text-xs text-muted font-mono">
                              Select a modified file to view line-by-line colored diff.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 10: Manifest V3 Migration Health */}
              {activeTab === "mv3" && (
                <div className="p-6 space-y-6 font-mono">
                  <div className="p-4 rounded-xl border border-line bg-surface2/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-muted">Overall MV3 Readiness Score</p>
                      <p className="text-2xl font-bold font-display text-brass mt-1">
                        {mv3Check ? `${mv3Check.score}%` : "100%"}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded text-xs uppercase font-bold ${
                        mv3Check?.isMV3 ? "bg-teal/20 text-teal border border-teal/40" : "bg-danger/20 text-danger border border-danger/40"
                      }`}
                    >
                      {mv3Check?.isMV3 ? "MV3 Compliant" : "MV2 Deprecated"}
                    </span>
                  </div>

                  {mv3Check && mv3Check.issues.length > 0 && (
                    <div className="space-y-3">
                      {mv3Check.issues.map((iss, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl border border-line bg-surface2/30 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-paper">{iss.field}</span>
                            <span className="text-amber-400">WARNING</span>
                          </div>
                          <p className="text-muted text-[11px]">{iss.description}</p>
                          <p className="text-teal text-[10px]">Remedy: {iss.remedy}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-6 text-center text-xs text-muted font-mono relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>GetCRX &bull; Developed by JOJIN JOHN &bull; All Rights Reserved</p>
        <div className="flex items-center gap-4">
          <a href="/sitemap.xml" target="_blank" className="hover:text-paper underline">
            Sitemap
          </a>
          <a href="/robots.txt" target="_blank" className="hover:text-paper underline">
            Robots.txt
          </a>
          <button onClick={() => setShowIdGuide(true)} className="hover:text-paper underline">
            Extension ID Guide
          </button>
        </div>
      </footer>

      {/* Command Palette Modal (Cmd+K / Ctrl+K) */}
      {showCommandPalette && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-3" />
              <input
                type="text"
                autoFocus
                placeholder="Jump to tab or run action (e.g. explorer, security, diff)..."
                className="w-full bg-surface2 border border-line rounded-xl pl-10 pr-3 py-2 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass font-mono"
              />
            </div>
            <div className="space-y-1 font-mono text-xs">
              {[
                { name: "Code Explorer", tab: "explorer" as const },
                { name: "Security & Secrets Auditor", tab: "security" as const },
                { name: "CSP & Attack Surface", tab: "csp" as const },
                { name: "Network Telemetry Harvester", tab: "network" as const },
                { name: "Asset & Icon Gallery", tab: "assets" as const },
                { name: "Bundle Composition & Metrics", tab: "analytics" as const },
                { name: "Enterprise Policies (.reg / JSON)", tab: "enterprise" as const },
                { name: "Version Diff Engine", tab: "diff" as const }
              ].map((act, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveTab(act.tab);
                    setShowCommandPalette(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface2 text-paper flex items-center justify-between"
                >
                  <span>{act.name}</span>
                  <span className="text-[10px] text-muted">Tab</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Permissions Encyclopedia Modal */}
      {showEncyclopedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowEncyclopedia(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div>
                <h3 className="font-display text-lg font-bold text-paper flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-teal" />
                  <span>Permissions & Threat Model Encyclopedia</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">Comprehensive audit reference for Chrome, Edge, and Firefox API permissions.</p>
              </div>
              <button onClick={() => setShowEncyclopedia(false)} className="text-muted hover:text-paper">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 border-b border-line flex flex-col sm:flex-row gap-2.5 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={encyclopediaSearch}
                  onChange={(e) => setEncyclopediaSearch(e.target.value)}
                  placeholder="Search permission or capability..."
                  className="w-full bg-surface2 border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass/70 font-mono"
                />
              </div>

              <div className="flex items-center gap-1 text-[11px] font-mono text-muted overflow-x-auto w-full sm:w-auto">
                {["All", "Network", "Storage & Data", "DOM & Tabs", "System & Native", "Privacy & Security"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setEncyclopediaCategory(cat)}
                    className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                      encyclopediaCategory === cat ? "bg-brass/20 text-brass border border-brass/40" : "hover:text-paper bg-surface2"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
              {filteredEncyclopedia.map((doc) => (
                <div key={doc.name} className="p-3.5 rounded-xl border border-line bg-surface2/40 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-paper text-xs">{doc.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted uppercase bg-surface px-1.5 py-0.5 rounded border border-line">
                        {doc.category}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                          doc.level === "high"
                            ? "bg-danger/20 text-danger border border-danger/30"
                            : doc.level === "medium"
                            ? "bg-amber-400/20 text-amber-400 border border-amber-400/30"
                            : "bg-teal/20 text-teal border border-teal/30"
                        }`}
                      >
                        {doc.level}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{doc.summary}</p>
                  <p className="text-[11px] text-danger/80 font-mono pt-1">
                    <strong>Threat Vector:</strong> {doc.threatModel}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Install Guide Modal */}
      {showInstallGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowInstallGuide(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="font-display text-lg font-bold text-paper flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>How to Load Unpacked Extensions</span>
              </h3>
              <button onClick={() => setShowInstallGuide(false)} className="text-muted hover:text-paper">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-surface2 border border-line space-y-1">
                <p className="text-brass font-bold">Step 1: Download & Unzip</p>
                <p className="text-muted">Click &quot;Download .ZIP&quot; on GetCRX and unzip the folder on your computer.</p>
              </div>

              <div className="p-3 rounded-xl bg-surface2 border border-line space-y-1">
                <p className="text-teal font-bold">Step 2: Open Browser Extensions Page</p>
                <p className="text-muted">In Google Chrome / Brave / Edge, navigate to:</p>
                <code className="block p-2 rounded bg-ink border border-line text-paper">chrome://extensions</code>
              </div>

              <div className="p-3 rounded-xl bg-surface2 border border-line space-y-1">
                <p className="text-amber-400 font-bold">Step 3: Enable Developer Mode & Load</p>
                <p className="text-muted">Toggle &quot;Developer mode&quot; on in the top-right corner, then click &quot;Load unpacked&quot; and select the unzipped directory.</p>
              </div>
            </div>

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-lg bg-brass text-ink font-semibold text-xs font-mono hover:bg-brassDim"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* 1-Click Bookmarklet Modal */}
      {showBookmarkletModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowBookmarkletModal(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="font-display text-lg font-bold text-paper flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-teal" />
                <span>1-Click Browser Bookmarklet</span>
              </h3>
              <button onClick={() => setShowBookmarkletModal(false)} className="text-muted hover:text-paper">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Drag the button below to your browser&apos;s bookmarks toolbar. When you visit any extension on the Chrome Web Store, click the bookmarklet to extract and unpack it instantly in GetCRX!
            </p>

            <div className="p-4 rounded-xl bg-surface2 border border-line flex flex-col items-center justify-center gap-3">
              <a
                href="javascript:(function(){var u=window.location.href;if(u.includes('chromewebstore.google.com/detail/')){var id=u.split('/detail/')[1].split('/')[0].split('?')[0];window.open('https://getcrx.vercel.app/?id='+id,'_blank');}else{alert('Please open a Chrome Web Store extension page first!');}})()"
                onClick={(e) => e.preventDefault()}
                className="px-4 py-2.5 rounded-xl bg-brass text-ink font-mono font-bold text-xs shadow-lg cursor-grab hover:bg-brassDim"
              >
                ⚡ Extract with GetCRX
              </a>
              <span className="text-[10px] font-mono text-muted">Drag & drop onto your Bookmarks Bar</span>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  "javascript:(function(){var u=window.location.href;if(u.includes('chromewebstore.google.com/detail/')){var id=u.split('/detail/')[1].split('/')[0].split('?')[0];window.open('https://getcrx.vercel.app/?id='+id,'_blank');}else{alert('Please open a Chrome Web Store extension page first!');}})()"
                );
                alert("Bookmarklet JavaScript copied to clipboard!");
              }}
              className="w-full py-2 rounded-lg bg-surface border border-line text-paper font-mono text-xs hover:bg-surface2"
            >
              Copy Bookmarklet Code
            </button>
          </div>
        </div>
      )}

      {/* ID Guide Modal */}
      {showIdGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowIdGuide(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setShowIdGuide(false)} className="absolute top-4 right-4 text-muted hover:text-paper">
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-display text-lg font-bold text-paper mb-2">How to Find Extension ID</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              Every Chrome extension has a unique 32-character ID:
            </p>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-line bg-surface2">
                <p className="font-semibold text-brass font-mono">Method 1: From Store URL (Easiest)</p>
                <code className="block mt-2 p-2 rounded bg-ink text-paper font-mono text-[11px] break-all border border-line">
                  chromewebstore.google.com/detail/name/<span className="text-brass font-bold">cjpalhdlnbpafiamejdnhcphjbkeiagm</span>
                </code>
              </div>

              <div className="p-3.5 rounded-xl border border-line bg-surface2">
                <p className="font-semibold text-brass font-mono">Method 2: From Installed Extensions</p>
                <p className="text-muted mt-1 leading-relaxed">
                  Go to <span className="text-paper font-mono">chrome://extensions</span>, enable Developer mode in top
                  right, and copy the 32-character ID listed under the extension.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIdGuide(false)}
              className="mt-6 w-full py-2.5 rounded-lg bg-brass text-ink font-semibold text-xs hover:bg-brassDim transition-colors font-mono"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function RenderTreeNodes({
  nodes,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  depth = 0
}: {
  nodes: TreeNode[];
  selectedFile: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.isDir) {
          const isExpanded = expandedFolders[node.path] ?? depth === 0;
          return (
            <div key={node.path}>
              <button
                onClick={() => onToggleFolder(node.path)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-muted hover:text-paper hover:bg-surface/50 rounded font-mono font-medium text-left"
                style={{ paddingLeft: `${Math.max(8, depth * 14)}px` }}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-brass/70 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted/60 shrink-0" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-brass shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-brass/70 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </button>

              {isExpanded && node.children.length > 0 && (
                <RenderTreeNodes
                  nodes={node.children}
                  selectedFile={selectedFile}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        const isSelected = selectedFile === node.path;
        const isCode = /\.(js|json|html|css|ts|jsx|tsx|md|txt)$/i.test(node.name);
        const isImg = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(node.name);

        return (
          <button
            key={node.path}
            onClick={() => onSelectFile(node.path)}
            className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs font-mono transition-colors text-left ${
              isSelected
                ? "bg-brass/20 text-brass border border-brass/30"
                : "text-muted hover:text-paper hover:bg-surface/50"
            }`}
            style={{ paddingLeft: `${Math.max(16, (depth + 1) * 14)}px` }}
          >
            <div className="flex items-center gap-1.5 truncate min-w-0">
              {isCode ? (
                <FileCode className="w-3.5 h-3.5 shrink-0 text-teal" />
              ) : isImg ? (
                <FileText className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              ) : (
                <File className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
            {node.size > 0 && (
              <span className="text-[10px] text-muted/60 shrink-0 font-mono">
                {(node.size / 1024).toFixed(1)}k
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function CrateMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8L12 4L21 8V16L12 20L3 16V8Z"
        stroke="#E8A33D"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M3 8L12 12L21 8" stroke="#E8A33D" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 12V20" stroke="#E8A33D" strokeWidth="1.8" />
    </svg>
  );
}


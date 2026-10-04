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
  BookOpen
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

const POPULAR_EXTENSIONS = [
  { name: "uBlock Lite", id: "ddkjiahejlhfcafbddmgiahcphecmpfh" },
  { name: "Dark Reader", id: "eimadpbcbfnmbkopoojfekhnkhdbieeh" },
  { name: "MetaMask", id: "nkbihfbeogaeaoehlefnkodbefgpgknn" },
  { name: "React DevTools", id: "fmkadmapgofadopljbjfkapdkoienihi" },
  { name: "Wappalyzer", id: "gppongmhjkpfnbhagpmjfkannfbllamg" },
  { name: "Bitwarden", id: "nngceckbapebfimnlniiiahkandclblb" }
];

type ActiveTab = "overview" | "explorer" | "security" | "network" | "diff" | "mv3";

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
  const [isDragging, setIsDragging] = useState(false);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);

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

  // Code Explorer ergonomics & beautifier
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
    const idParam = params.get("id") || params.get("q") || params.get("ext");
    if (idParam) {
      setQuery(idParam);
      runLookup(idParam);
    }
  }, []);

  // Active code content based on beautify toggle
  const displayedCode = useMemo(() => {
    if (!rawFileContent || !selectedFile) return rawFileContent;
    if (isBeautified) {
      return beautifyCode(rawFileContent, selectedFile);
    }
    return rawFileContent;
  }, [rawFileContent, selectedFile, isBeautified]);

  async function runLookup(inputQuery: string) {
    const id = extractExtensionId(inputQuery);
    if (!id) {
      setErrorMsg("Couldn't find a valid extension ID, Chrome Store link, or Firefox Add-on URL.");
      setStatus("error");
      return;
    }

    setStatus("looking");
    setErrorMsg(null);
    setMeta(null);
    setZipInstance(null);
    setZipEntries([]);
    setIsUnpacking(true);
    setUnpackError(null);
    setSelectedFile(null);
    setRawFileContent(null);
    setFileImageUrl(null);
    setManifestData(null);
    setSecurityScan(null);
    setMv3Check(null);
    setDiffResult(null);
    setZipBInstance(null);
    setNetworkHarvest(null);
    setContentSearchMatches([]);
    setCustomRuleMatches([]);
    setActiveTab("overview");

    try {
      const res = await fetch(`/api/meta?q=${encodeURIComponent(id)}`);
      const data = await res.json();

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
      const zip = await JSZip.loadAsync(arrayBuffer);
      setZipInstance(zip);

      const entries: ZipEntryInfo[] = [];
      zip.forEach((relativePath, file) => {
        entries.push({
          path: relativePath,
          name: relativePath.split("/").filter(Boolean).pop() || relativePath,
          isDir: file.dir,
          size: (file as any)._data?.uncompressedSize || 0
        });
      });

      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.path.localeCompare(b.path);
      });

      setZipEntries(entries);

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
    setMeta({
      id: file.name.replace(/\.[^/.]+$/, ""),
      name: file.name,
      icon: null,
      description: `Local file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      notFound: false
    });

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const zipBytes = stripCrxHeaderUint8Array(uint8);
      const zip = await JSZip.loadAsync(zipBytes);

      setZipInstance(zip);
      const entries: ZipEntryInfo[] = [];
      zip.forEach((relativePath, zipFile) => {
        entries.push({
          path: relativePath,
          name: relativePath.split("/").filter(Boolean).pop() || relativePath,
          isDir: zipFile.dir,
          size: (zipFile as any)._data?.uncompressedSize || 0
        });
      });

      entries.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.path.localeCompare(b.path);
      });

      setZipEntries(entries);

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

    const textA = fileA ? await fileA.async("text").catch(() => "(binary)") : "";
    const textB = fileB ? await fileB.async("text").catch(() => "(binary)") : "";

    const lines = computeLineDiff(textA, textB);
    setDiffLines(lines);
  }

  async function handleSelectFile(path: string, lineToHighlight?: number) {
    if (!zipInstance) return;
    const file = zipInstance.file(path);
    if (!file) return;

    setSelectedFile(path);
    setFileImageUrl(null);
    setRawFileContent(null);
    setHighlightLine(lineToHighlight ?? null);

    const isImage = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(path);
    if (isImage) {
      const blob = await file.async("blob");
      const url = URL.createObjectURL(blob);
      setFileImageUrl(url);
    } else {
      try {
        const text = await file.async("text");
        setRawFileContent(text);
      } catch {
        setRawFileContent("(Binary file — cannot preview text)");
      }
    }
  }

  async function handleDownloadSingleFile(path: string) {
    if (!zipInstance) return;
    const file = zipInstance.file(path);
    if (!file) return;

    const blob = await file.async("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleCopyCLI() {
    if (!meta) return;
    const curl = `curl -X POST https://getcrx.vercel.app/api/extract -H "Content-Type: application/json" -d '{"q":"${meta.id}"}' -o "${meta.id}.zip"`;
    navigator.clipboard.writeText(curl);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  }

  function handleCopyCode() {
    if (!displayedCode) return;
    navigator.clipboard.writeText(displayedCode);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  }

  function handleCopyManifestJson() {
    if (!manifestData) return;
    navigator.clipboard.writeText(JSON.stringify(manifestData, null, 2));
    setCopiedManifest(true);
    setTimeout(() => setCopiedManifest(false), 2000);
  }

  // Full-text search across all files in the archive
  async function performContentSearch(term: string) {
    if (!zipInstance || !term.trim()) {
      setContentSearchMatches([]);
      return;
    }

    setIsSearchingContent(true);
    const matches: SearchMatch[] = [];
    const textExts = /\.(js|ts|jsx|tsx|json|html|htm|css|txt|md)$/i;

    const promises: Promise<void>[] = [];
    zipInstance.forEach((relativePath, file) => {
      if (file.dir || !textExts.test(relativePath)) return;

      promises.push(
        (async () => {
          try {
            const text = await file.async("text");
            const lines = text.split("\n");
            const lowerTerm = term.toLowerCase();

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowerTerm)) {
                matches.push({
                  file: relativePath,
                  line: i + 1,
                  snippet: lines[i].trim().slice(0, 140)
                });
                if (matches.length >= 80) break;
              }
            }
          } catch {}
        })()
      );
    });

    await Promise.all(promises);
    setContentSearchMatches(matches);
    setIsSearchingContent(false);
  }

  // Custom Security Rule Scanner
  async function runCustomRuleScan(pattern: string) {
    if (!zipInstance || !pattern.trim()) {
      setCustomRuleMatches([]);
      return;
    }

    setIsScanningCustomRule(true);
    const matches: Array<{ file: string; line: number; snippet: string }> = [];
    let regex: RegExp;

    try {
      regex = new RegExp(pattern, "gi");
    } catch {
      alert("Invalid regular expression pattern.");
      setIsScanningCustomRule(false);
      return;
    }

    const textExts = /\.(js|ts|jsx|tsx|json|html|htm|css|txt|md|yaml|yml)$/i;
    const promises: Promise<void>[] = [];

    zipInstance.forEach((relativePath, file) => {
      if (file.dir || !textExts.test(relativePath)) return;

      promises.push(
        (async () => {
          try {
            const text = await file.async("text");
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              regex.lastIndex = 0;
              if (regex.test(lines[i])) {
                matches.push({
                  file: relativePath,
                  line: i + 1,
                  snippet: lines[i].trim().slice(0, 150)
                });
                if (matches.length >= 100) break;
              }
            }
          } catch {}
        })()
      );
    });

    await Promise.all(promises);
    setCustomRuleMatches(matches);
    setIsScanningCustomRule(false);
  }

  function reset() {
    setStatus("idle");
    setMeta(null);
    setErrorMsg(null);
    setQuery("");
    setZipInstance(null);
    setZipEntries([]);
    setSelectedFile(null);
    setRawFileContent(null);
    setManifestData(null);
    setSecurityScan(null);
    setMv3Check(null);
    setDiffResult(null);
    setZipBInstance(null);
    setNetworkHarvest(null);
    setContentSearchMatches([]);
    setCustomRuleMatches([]);
    setActiveTab("overview");
    inputRef.current?.focus();
  }

  const permissionsList = useMemo(() => {
    if (!manifestData) return [];
    const regular = manifestData.permissions || [];
    const host = manifestData.host_permissions || [];
    const optional = manifestData.optional_permissions || [];
    const all = Array.from(new Set([...regular, ...host, ...optional]));
    return all.map(classifyPermission);
  }, [manifestData]);

  const filteredEntries = useMemo(() => {
    if (!fileSearch.trim()) return zipEntries;
    return zipEntries.filter((e) => e.path.toLowerCase().includes(fileSearch.toLowerCase()));
  }, [zipEntries, fileSearch]);

  const treeNodes = useMemo(() => {
    return buildFileTree(filteredEntries);
  }, [filteredEntries]);

  const filteredNetworkEndpoints = useMemo(() => {
    if (!networkHarvest) return [];
    if (!networkFilter.trim()) return networkHarvest.endpoints;
    const term = networkFilter.toLowerCase();
    return networkHarvest.endpoints.filter((e) => e.url.toLowerCase().includes(term) || e.domain.toLowerCase().includes(term));
  }, [networkHarvest, networkFilter]);

  const filteredEncyclopedia = useMemo(() => {
    return PERMISSIONS_DATABASE.filter((p) => {
      const matchCat = encyclopediaCategory === "All" || p.category === encyclopediaCategory;
      const matchSearch =
        !encyclopediaSearch.trim() ||
        p.name.toLowerCase().includes(encyclopediaSearch.toLowerCase()) ||
        p.summary.toLowerCase().includes(encyclopediaSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [encyclopediaSearch, encyclopediaCategory]);

  function toggleFolder(folderPath: string) {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  }

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleFileDrop}
      className="relative min-h-screen bg-ink text-paper overflow-x-hidden"
    >
      <div className="grain" />

      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/90 backdrop-blur-sm border-2 border-dashed border-brass pointer-events-none">
          <UploadCloud className="w-16 h-16 text-brass animate-bounce" />
          <p className="mt-4 text-xl font-display font-semibold text-paper">Drop .CRX, .XPI, or .ZIP file to unpack</p>
          <p className="text-sm text-muted">Zero-upload client-side extraction</p>
        </div>
      )}

      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8 pb-4 border-b border-line/40">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <CrateMark />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold tracking-tight text-paper">GetCRX</span>
            </div>
            <p className="text-[11px] text-muted tracking-tight">Chrome & Firefox Extension Unpacker & Security Auditor</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setShowEncyclopedia(true)}
            className="focus-ring rounded px-2.5 py-1 bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1.5 transition-colors hidden sm:flex"
          >
            <BookOpen className="w-3 h-3 text-teal" />
            <span>Permissions Doc</span>
          </button>
          <button
            onClick={() => setShowCommandPalette(true)}
            className="focus-ring rounded px-2.5 py-1 bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1.5 transition-colors"
          >
            <Command className="w-3 h-3 text-brass" />
            <span>Cmd+K</span>
          </button>
          <button
            onClick={() => setShowIdGuide(true)}
            className="focus-ring rounded text-muted transition-colors hover:text-brass flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-brass" />
            <span>Where is ID</span>
          </button>
          <span className="text-line hidden sm:inline-block">|</span>
          <span className="font-mono text-muted text-[11px] hidden sm:inline-block">
            Dev by <span className="text-brass font-medium">JOJIN JOHN</span>
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-surface/80 text-xs text-muted mb-4 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <span>Source Code Explorer • Telemetry Harvester • Version Diff Engine</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-paper">
            Extract, inspect, and audit any{" "}
            <span className="bg-gradient-to-r from-brass via-amber-300 to-teal bg-clip-text text-transparent">
              Browser Extension.
            </span>
          </h1>

          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Paste a Chrome Web Store link, Firefox Add-on URL, or 32-character ID. GetCRX strips binary container headers,
            formats code, harvests network endpoints, and scans for secrets and vulnerabilities in real time.
          </p>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleLookup} className="mt-8 max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-2.5 p-1.5 bg-surface border border-line rounded-xl shadow-2xl focus-within:border-brass/70 transition-colors">
            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-muted absolute left-3.5" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Paste Chrome Web Store link, Firefox URL, 32-char ID, or drop .crx/.xpi"
                disabled={status === "looking" || status === "extracting"}
                className="w-full bg-transparent pl-10 pr-4 py-3 font-mono text-[13px] text-paper placeholder:text-muted/60 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={status === "looking" || status === "extracting" || !query.trim()}
              className="shrink-0 rounded-lg bg-brass px-6 py-3 text-sm font-semibold text-ink transition-all hover:bg-brassDim disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {status === "looking" ? (
                <>
                  <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Looking up…</span>
                </>
              ) : (
                "Look up"
              )}
            </button>
          </div>
        </form>

        {/* Popular Quick-Select Chips */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 max-w-2xl mx-auto text-xs text-muted">
          <span className="text-[11px] font-mono text-muted/70 mr-1">Popular:</span>
          {POPULAR_EXTENSIONS.map((ext) => (
            <button
              key={ext.id}
              onClick={() => {
                setQuery(ext.id);
                runLookup(ext.id);
              }}
              className="px-2.5 py-1 rounded-md border border-line/60 bg-surface/60 hover:bg-surface2 hover:border-brass/40 hover:text-paper transition-colors text-[11px] font-mono"
            >
              {ext.name}
            </button>
          ))}
          <button
            onClick={() => setShowIdGuide(true)}
            className="px-2 py-1 text-brass text-[11px] hover:underline flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            <span>Where is ID?</span>
          </button>
        </div>

        {/* Recent Audits History Chips */}
        {recentAudits.length > 0 && status === "idle" && (
          <div className="mt-6 p-4 rounded-xl border border-line bg-surface/60 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-muted flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-brass" />
                <span>Recent Audits</span>
              </span>
              <button
                onClick={clearRecentAudits}
                className="text-[11px] font-mono text-muted/60 hover:text-danger flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear History</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentAudits.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setQuery(item.id);
                    runLookup(item.id);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface2 hover:border-brass/40 transition-colors text-xs flex items-center gap-2 max-w-[200px]"
                >
                  {item.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.icon} alt="" className="w-3.5 h-3.5 rounded object-contain shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-muted shrink-0" />
                  )}
                  <span className="truncate font-mono text-[11px] text-paper">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status Messages */}
        <AnimatePresence mode="wait">
          {status === "error" && errorMsg && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 max-w-2xl mx-auto rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Result Interface */}
        <AnimatePresence mode="wait">
          {meta && (status === "found" || status === "extracting" || status === "done") && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-10 rounded-2xl border border-line bg-surface overflow-hidden shadow-2xl"
            >
              {/* Card Header Banner */}
              <div className="p-6 border-b border-line bg-surface2/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  {meta.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meta.icon}
                      alt=""
                      className="w-14 h-14 shrink-0 rounded-xl border border-line object-cover bg-surface"
                    />
                  ) : (
                    <div className="w-14 h-14 shrink-0 rounded-xl border border-line bg-surface2 flex items-center justify-center text-muted">
                      <Package className="w-6 h-6 text-muted" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-paper truncate">{meta.name || "Unnamed Extension"}</h2>
                      {manifestData?.version && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-line text-muted">
                          v{manifestData.version}
                        </span>
                      )}
                      {manifestData?.manifest_version && (
                        <span
                          className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
                            manifestData.manifest_version === 3
                              ? "bg-teal/10 text-teal border-teal/30"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          MV{manifestData.manifest_version}
                        </span>
                      )}
                      {securityScan && (
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                            securityScan.grade === "A+" || securityScan.grade === "A"
                              ? "bg-teal/15 text-teal border-teal/30"
                              : securityScan.grade === "B"
                              ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
                              : "bg-danger/15 text-danger border-danger/30"
                          }`}
                        >
                          Security: {securityScan.grade} ({securityScan.score}/100)
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted/80 truncate mt-0.5">{meta.id}</p>
                    {meta.description && (
                      <p className="text-xs text-muted/90 line-clamp-2 mt-1.5 leading-relaxed">{meta.description}</p>
                    )}
                  </div>
                </div>

                {/* Primary Download Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={handleDownloadZip}
                    disabled={status === "extracting"}
                    className="focus-ring flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-xs font-semibold text-ink transition-all hover:bg-teal/90 disabled:opacity-50 shadow-sm"
                  >
                    {status === "done" ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                    {status === "extracting" ? "Unpacking…" : status === "done" ? "Downloaded" : "Get Source (.zip)"}
                  </button>

                  <button
                    onClick={handleDownloadRawCrx}
                    title="Download raw original .crx file signed by Chrome"
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-medium text-muted hover:text-paper hover:bg-surface2 transition-colors"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>Raw Package</span>
                  </button>

                  <button
                    onClick={handleDownloadManifest}
                    title="Download parsed manifest.json"
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-medium text-muted hover:text-paper hover:bg-surface2 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-brass" />
                    <span>Manifest</span>
                  </button>

                  <button
                    onClick={handleCopyCLI}
                    title="Copy cURL CLI command"
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs font-medium text-muted hover:text-paper hover:bg-surface2 transition-colors"
                  >
                    {copiedCli ? <Check className="w-3.5 h-3.5 text-teal" /> : <Terminal className="w-3.5 h-3.5" />}
                    <span>{copiedCli ? "Copied" : "cURL"}</span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center border-b border-line bg-surface px-6 text-xs font-medium overflow-x-auto">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "overview"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>Overview</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("explorer");
                    if (!selectedFile && zipEntries.length > 0) {
                      const firstCode =
                        zipEntries.find((e) => !e.isDir && e.name.endsWith("manifest.json")) ||
                        zipEntries.find((e) => !e.isDir);
                      if (firstCode) handleSelectFile(firstCode.path);
                    }
                  }}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "explorer"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>
                    Code Explorer ({isUnpacking ? "..." : `${zipEntries.filter((e) => !e.isDir).length}`})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("security")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors shrink-0 ${
                    activeTab === "security"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Security & Custom Rules</span>
                  {securityScan && (securityScan.summary.critical > 0 || securityScan.summary.high > 0) && (
                    <span className="px-1.5 py-0.2 rounded-full bg-danger/20 text-danger text-[10px] font-mono border border-danger/30">
                      {securityScan.summary.critical + securityScan.summary.high}
                    </span>
                  )}
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
                  <span>
                    Network & Telemetry ({networkHarvest ? networkHarvest.uniqueDomains.length : "..."})
                  </span>
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
                        {isUnpacking
                          ? "Processing package..."
                          : `${(zipEntries.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB unpacked source`}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-line bg-surface2/50">
                      <p className="text-[11px] font-mono uppercase text-muted">Security Score</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-bold font-display text-paper">
                          {isScanningSecurity ? "Scanning..." : securityScan ? `${securityScan.score}/100 (Grade ${securityScan.grade})` : `${permissionsList.length} Permissions`}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1">
                        {securityScan && securityScan.findings.length > 0 ? (
                          <span className={securityScan.summary.critical > 0 || securityScan.summary.high > 0 ? "text-danger font-medium" : "text-amber-400 font-medium"}>
                            {securityScan.findings.length} security finding(s) detected
                          </span>
                        ) : (
                          <span className="text-teal font-medium">Clean audit profile</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Threat Intel & Deep Links */}
                  <div className="p-4 rounded-xl border border-line bg-surface2/30 flex items-center justify-between gap-4 flex-wrap text-xs">
                    <div className="space-y-1">
                      <p className="text-muted font-mono text-[11px]">Threat Intelligence & Store Lookups:</p>
                      <div className="flex items-center gap-3 font-mono flex-wrap">
                        <a
                          href={`https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(meta.id.length === 32 ? `https://chromewebstore.google.com/detail/${meta.id}` : `https://addons.mozilla.org/en-US/firefox/addon/${meta.id}/`)}`}
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
                          href={meta.id.length === 32 ? `https://chromewebstore.google.com/detail/${meta.id}` : `https://addons.mozilla.org/en-US/firefox/addon/${meta.id}/`}
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
                        className="px-3 py-2 rounded-lg bg-surface border border-line text-paper hover:bg-surface2 transition-colors flex items-center gap-1.5 text-xs"
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
                        className="px-4 py-2 rounded-lg bg-brass text-ink font-semibold hover:bg-brassDim transition-colors flex items-center gap-1.5 text-xs"
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Explore Source Code</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Advanced Code Explorer with Beautifier & Resizer */}
              {activeTab === "explorer" && (
                <div className={`grid grid-cols-1 md:grid-cols-12 ${isFullscreenCode ? "fixed inset-0 z-50 bg-ink p-4" : "min-h-[560px]"}`}>
                  {/* Left Column: File Tree & Search */}
                  <div className="md:col-span-4 border-r border-line bg-surface2/30 flex flex-col">
                    {/* Search & Mode Switcher */}
                    <div className="p-3 border-b border-line space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={fileSearch}
                          onChange={(e) => {
                            setFileSearch(e.target.value);
                            if (searchMode === "content") {
                              performContentSearch(e.target.value);
                            }
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
                          nodes={treeNodes}
                          selectedFile={selectedFile}
                          expandedFolders={expandedFolders}
                          onToggleFolder={toggleFolder}
                          onSelectFile={handleSelectFile}
                        />
                      ) : (
                        filteredEntries.map((entry) => {
                          const isSelected = selectedFile === entry.path;
                          const isCode = /\.(js|json|html|css|ts|jsx|tsx|md|txt)$/i.test(entry.name);
                          const isImg = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(entry.name);

                          if (entry.isDir) return null;

                          return (
                            <button
                              key={entry.path}
                              onClick={() => handleSelectFile(entry.path)}
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs font-mono transition-colors text-left ${
                                isSelected
                                  ? "bg-brass/20 text-brass border border-brass/30"
                                  : "text-muted hover:text-paper hover:bg-surface"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate min-w-0">
                                {isCode ? (
                                  <FileCode className="w-3.5 h-3.5 shrink-0 text-teal" />
                                ) : isImg ? (
                                  <FileText className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                ) : (
                                  <File className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{entry.path}</span>
                              </div>
                              <span className="text-[10px] text-muted/60 shrink-0 font-mono">
                                {(entry.size / 1024).toFixed(1)}k
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Code Viewer */}
                  <div className="md:col-span-8 flex flex-col bg-ink/70">
                    {selectedFile ? (
                      <>
                        <div className="p-3 border-b border-line flex items-center justify-between gap-2 bg-surface/90 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-paper truncate font-medium">{selectedFile}</span>
                            {highlightLine && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                Line {highlightLine}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Beautify Button */}
                            <button
                              onClick={() => setIsBeautified(!isBeautified)}
                              title="Toggle JS/JSON Code Beautification"
                              className={`px-2 py-1 rounded border text-[11px] font-mono flex items-center gap-1 transition-colors ${
                                isBeautified
                                  ? "bg-teal/20 text-teal border-teal/40"
                                  : "bg-surface border-line text-muted hover:text-paper"
                              }`}
                            >
                              <Sparkles className="w-3 h-3 text-teal" />
                              <span>{isBeautified ? "Beautified" : "Beautify"}</span>
                            </button>

                            {/* Wrap Button */}
                            <button
                              onClick={() => setWrapLines(!wrapLines)}
                              title="Toggle Word Wrap"
                              className={`px-2 py-1 rounded border text-[11px] font-mono flex items-center gap-1 ${
                                wrapLines ? "bg-brass/20 text-brass border-brass/40" : "bg-surface border-line text-muted hover:text-paper"
                              }`}
                            >
                              <WrapText className="w-3 h-3" />
                              <span>Wrap</span>
                            </button>

                            {/* Fullscreen Button */}
                            <button
                              onClick={() => setIsFullscreenCode(!isFullscreenCode)}
                              title="Toggle Fullscreen"
                              className="px-2 py-1 rounded bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1"
                            >
                              {isFullscreenCode ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                            </button>

                            {displayedCode && (
                              <button
                                onClick={handleCopyCode}
                                className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1"
                              >
                                {copiedFile ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedFile ? "Copied" : "Copy"}</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDownloadSingleFile(selectedFile)}
                              className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1"
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

              {/* Tab 3: Security & Custom Rules Scanner */}
              {activeTab === "security" && (
                <div className="p-6 space-y-6">
                  {/* Security Score Banner */}
                  <div className="p-5 rounded-2xl border border-line bg-surface2/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-display font-bold border ${
                          securityScan?.grade === "A+" || securityScan?.grade === "A"
                            ? "bg-teal/20 text-teal border-teal/40"
                            : securityScan?.grade === "B"
                            ? "bg-amber-400/20 text-amber-400 border-amber-400/40"
                            : "bg-danger/20 text-danger border-danger/40"
                        }`}
                      >
                        <span className="text-2xl leading-none">{securityScan?.grade ?? "A"}</span>
                        <span className="text-[10px] font-mono mt-1">{securityScan?.score ?? 100}/100</span>
                      </div>
                      <div>
                        <h3 className="font-display text-base font-bold text-paper">
                          Automated Security & Vulnerability Audit
                        </h3>
                        <p className="text-xs text-muted mt-0.5">
                          Scanned {securityScan?.filesScanned ?? 0} files in {securityScan?.scanDurationMs ?? 0}ms across secrets, code sinks, CSP, and permissions.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleExportSecurityReport}
                      className="focus-ring flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-xs font-semibold text-ink hover:bg-teal/90 transition-colors shadow-sm self-start md:self-auto"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download Audit Report (.md)</span>
                    </button>
                  </div>

                  {/* Custom Security Rule Scanner */}
                  <div className="p-5 rounded-2xl border border-brass/40 bg-brass/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display text-sm font-bold text-paper flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-brass" />
                        <span>Custom Security & Pattern Scanner</span>
                      </h4>
                      <span className="text-[11px] font-mono text-muted">Live Regex Engine</span>
                    </div>

                    <p className="text-xs text-muted leading-relaxed">
                      Enter a custom regex string or pattern to scan the entire extension package for internal endpoints, proprietary secrets, or custom indicators of compromise.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={customRuleInput}
                        onChange={(e) => setCustomRuleInput(e.target.value)}
                        placeholder="e.g. api\.internal\.corp|bearer\s+[A-Za-z0-9\-_]+|wss?:\/\/"
                        className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-xs font-mono text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass/70"
                      />
                      <button
                        onClick={() => runCustomRuleScan(customRuleInput)}
                        disabled={isScanningCustomRule || !customRuleInput.trim()}
                        className="px-4 py-2 rounded-lg bg-brass text-ink font-semibold text-xs hover:bg-brassDim transition-colors shrink-0 disabled:opacity-40"
                      >
                        {isScanningCustomRule ? "Scanning..." : "Run Custom Scan"}
                      </button>
                    </div>

                    {/* Custom Match Results */}
                    {customRuleMatches.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl bg-ink border border-line space-y-2">
                        <p className="text-xs font-bold text-teal font-mono">
                          Found {customRuleMatches.length} match(es) for &ldquo;{customRuleInput}&rdquo;:
                        </p>
                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                          {customRuleMatches.map((m, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setActiveTab("explorer");
                                handleSelectFile(m.file, m.line);
                              }}
                              className="w-full p-2 rounded text-left text-xs bg-surface border border-line hover:border-brass/40 transition-colors font-mono flex items-center justify-between gap-2"
                            >
                              <span className="truncate text-brass">{m.file}:{m.line}</span>
                              <span className="truncate text-muted text-[11px]">{m.snippet}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Counters */}
                  {securityScan && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-3 rounded-xl border border-danger/30 bg-danger/10">
                        <span className="text-danger font-bold text-base">{securityScan.summary.critical}</span>
                        <p className="text-danger/80 text-[11px] mt-0.5">Critical Risk</p>
                      </div>
                      <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-400/10">
                        <span className="text-amber-400 font-bold text-base">{securityScan.summary.high}</span>
                        <p className="text-amber-400/80 text-[11px] mt-0.5">High Risk</p>
                      </div>
                      <div className="p-3 rounded-xl border border-line bg-surface2">
                        <span className="text-paper font-bold text-base">{securityScan.summary.medium}</span>
                        <p className="text-muted text-[11px] mt-0.5">Medium Risk</p>
                      </div>
                      <div className="p-3 rounded-xl border border-teal/30 bg-teal/10">
                        <span className="text-teal font-bold text-base">{securityScan.summary.low}</span>
                        <p className="text-teal/80 text-[11px] mt-0.5">Low / Informational</p>
                      </div>
                    </div>
                  )}

                  {/* Hardcoded Secrets */}
                  {securityScan && securityScan.secrets.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-display text-sm font-semibold text-paper flex items-center gap-2">
                        <Key className="w-4 h-4 text-danger" />
                        <span>Hardcoded Secrets & Leaked Credentials ({securityScan.secrets.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {securityScan.secrets.map((finding) => (
                          <div key={finding.id} className="p-4 rounded-xl border border-danger/40 bg-danger/10 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-danger font-mono">{finding.title}</span>
                              <span className="px-1.5 py-0.5 rounded bg-danger/20 text-danger text-[10px] font-mono uppercase font-bold border border-danger/30">
                                {finding.severity}
                              </span>
                            </div>
                            <p className="text-muted mt-1">{finding.description}</p>
                            {finding.file && (
                              <button
                                onClick={() => {
                                  setActiveTab("explorer");
                                  handleSelectFile(finding.file!, finding.line);
                                }}
                                className="mt-2 text-brass hover:underline font-mono text-[11px] flex items-center gap-1"
                              >
                                <span>Jump to {finding.file}:{finding.line}</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hazardous Code Sinks */}
                  {securityScan && securityScan.codeVulnerabilities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-display text-sm font-semibold text-paper flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        <span>Dangerous JavaScript Sinks & APIs ({securityScan.codeVulnerabilities.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {securityScan.codeVulnerabilities.map((finding) => (
                          <div key={finding.id} className="p-4 rounded-xl border border-line bg-surface2/40 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-paper font-mono">{finding.title}</span>
                              <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400 text-[10px] font-mono uppercase font-bold border border-amber-400/30">
                                {finding.severity}
                              </span>
                            </div>
                            <p className="text-muted mt-1 leading-relaxed">{finding.description}</p>
                            {finding.snippet && (
                              <code className="block mt-2 p-2 rounded bg-ink font-mono text-[11px] text-teal break-all border border-line">
                                {finding.snippet}
                              </code>
                            )}
                            {finding.file && (
                              <button
                                onClick={() => {
                                  setActiveTab("explorer");
                                  handleSelectFile(finding.file!, finding.line);
                                }}
                                className="mt-2 text-brass hover:underline font-mono text-[11px] flex items-center gap-1"
                              >
                                <span>Inspect in Code Explorer ({finding.file}:{finding.line})</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Declared Permissions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display text-sm font-semibold text-paper flex items-center gap-2">
                        <Shield className="w-4 h-4 text-brass" />
                        <span>Declared Permissions & Attack Surface ({permissionsList.length})</span>
                      </h4>
                      <button
                        onClick={() => setShowEncyclopedia(true)}
                        className="text-teal hover:underline text-xs font-mono flex items-center gap-1"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>View Encyclopedia</span>
                      </button>
                    </div>

                    {permissionsList.length === 0 ? (
                      <div className="p-4 rounded-xl border border-teal/30 bg-teal/10 text-teal text-xs flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Zero permissions requested. This extension runs with minimal attack surface.</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5">
                        {permissionsList.map((perm) => (
                          <div
                            key={perm.name}
                            className="p-3.5 rounded-xl border border-line bg-surface2/40 flex items-start gap-3"
                          >
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold shrink-0 mt-0.5 border ${
                                perm.level === "high"
                                  ? "bg-danger/15 text-danger border-danger/30"
                                  : perm.level === "medium"
                                  ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
                                  : "bg-teal/15 text-teal border-teal/30"
                              }`}
                            >
                              {perm.level}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-xs font-semibold text-paper">{perm.name}</p>
                              <p className="text-xs text-muted mt-0.5 leading-relaxed">{perm.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 4: Network Endpoints & Telemetry Harvester */}
              {activeTab === "network" && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="font-display text-base font-bold text-paper flex items-center gap-2">
                      <Radio className="w-4 h-4 text-teal" />
                      <span>Network Endpoints & External Domain Harvester</span>
                    </h3>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Every external URL, telemetry tracker, WebSocket endpoint, and API server discovered in the extension source code.
                    </p>
                  </div>

                  {networkHarvest && (
                    <div className="space-y-6">
                      {/* Top Contacted Domains */}
                      <div className="p-4 rounded-2xl border border-line bg-surface2/40 space-y-3">
                        <h4 className="font-display text-xs font-mono font-bold text-brass uppercase">
                          Discovered External Domains ({networkHarvest.uniqueDomains.length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {networkHarvest.domainsByCount.map((d) => (
                            <span
                              key={d.domain}
                              className="px-2.5 py-1 rounded-lg border border-line bg-surface text-xs font-mono flex items-center gap-1.5"
                            >
                              <Globe className="w-3 h-3 text-teal shrink-0" />
                              <span className="text-paper">{d.domain}</span>
                              <span className="px-1.5 py-0.2 rounded-full bg-surface2 text-muted text-[10px] font-bold">
                                {d.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Filterable Endpoints Table */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <h4 className="font-display text-sm font-semibold text-paper">
                            Discovered URLs & Endpoints ({filteredNetworkEndpoints.length})
                          </h4>
                          <div className="relative w-64">
                            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                            <input
                              type="text"
                              value={networkFilter}
                              onChange={(e) => setNetworkFilter(e.target.value)}
                              placeholder="Filter URLs or domains..."
                              className="w-full bg-surface border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass/70 font-mono"
                            />
                          </div>
                        </div>

                        <div className="border border-line rounded-xl overflow-hidden">
                          <div className="overflow-x-auto max-h-[440px]">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-surface2/70 text-muted uppercase text-[10px] border-b border-line sticky top-0">
                                <tr>
                                  <th className="p-3">Protocol</th>
                                  <th className="p-3">Endpoint URL</th>
                                  <th className="p-3">File Location</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line/40">
                                {filteredNetworkEndpoints.map((ep, idx) => (
                                  <tr key={idx} className="hover:bg-surface2/40 transition-colors">
                                    <td className="p-3 shrink-0">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                          ep.protocol === "https" || ep.protocol === "wss"
                                            ? "bg-teal/20 text-teal"
                                            : "bg-danger/20 text-danger"
                                        }`}
                                      >
                                        {ep.protocol}
                                      </span>
                                    </td>
                                    <td className="p-3 text-paper break-all select-all font-semibold max-w-md">
                                      {ep.url}
                                    </td>
                                    <td className="p-3 text-muted shrink-0">
                                      <button
                                        onClick={() => {
                                          setActiveTab("explorer");
                                          handleSelectFile(ep.file, ep.line);
                                        }}
                                        className="text-brass hover:underline flex items-center gap-1"
                                      >
                                        <span>{ep.file}:{ep.line}</span>
                                        <ChevronRight className="w-3 h-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: CRX Package Diff & Version Comparison */}
              {activeTab === "diff" && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="font-display text-base font-bold text-paper flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-teal" />
                      <span>CRX Package Version Diff & Supply Chain Auditor</span>
                    </h3>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Compare the currently loaded extension against a newer/older version to detect rogue permission escalations, modified background scripts, and supply chain alterations.
                    </p>
                  </div>

                  {/* Package B Upload Card */}
                  <div className="p-6 rounded-2xl border-2 border-dashed border-line bg-surface2/30 flex flex-col items-center justify-center text-center">
                    <UploadCloud className="w-10 h-10 text-teal mb-2" />
                    <p className="text-sm font-semibold text-paper">Select or Drop Version B (.crx / .xpi / .zip)</p>
                    <p className="text-xs text-muted mt-1 max-w-sm">
                      Upload the second package to compute file additions, deletions, code diffs, and permission shifts.
                    </p>

                    <label className="mt-4 px-4 py-2 rounded-lg bg-teal text-ink font-semibold text-xs hover:bg-teal/90 transition-colors cursor-pointer">
                      <span>Choose Package B</span>
                      <input
                        type="file"
                        accept=".crx,.zip,.xpi"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadPackageB(file);
                        }}
                      />
                    </label>
                  </div>

                  {/* Diff Results Interface */}
                  {diffResult && (
                    <div className="space-y-6">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-3 rounded-xl border border-teal/30 bg-teal/10">
                          <span className="text-teal font-bold text-base">+{diffResult.summary.addedFiles}</span>
                          <p className="text-teal/80 text-[11px] mt-0.5">Added Files</p>
                        </div>
                        <div className="p-3 rounded-xl border border-danger/30 bg-danger/10">
                          <span className="text-danger font-bold text-base">-{diffResult.summary.removedFiles}</span>
                          <p className="text-danger/80 text-[11px] mt-0.5">Removed Files</p>
                        </div>
                        <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-400/10">
                          <span className="text-amber-400 font-bold text-base">~{diffResult.summary.modifiedFiles}</span>
                          <p className="text-amber-400/80 text-[11px] mt-0.5">Modified Files</p>
                        </div>
                        <div className="p-3 rounded-xl border border-line bg-surface2">
                          <span className="text-paper font-bold text-base">{diffResult.summary.unchangedFiles}</span>
                          <p className="text-muted text-[11px] mt-0.5">Unchanged Files</p>
                        </div>
                      </div>

                      {/* Permission Changes Alert */}
                      {(diffResult.permissionChanges.added.length > 0 || diffResult.permissionChanges.removed.length > 0) && (
                        <div className="p-4 rounded-xl border border-amber-400/40 bg-amber-400/10 space-y-2">
                          <h4 className="font-display text-sm font-bold text-amber-300">Permission Escalations & Changes</h4>
                          {diffResult.permissionChanges.added.length > 0 && (
                            <div className="text-xs font-mono text-teal">
                              <strong>Added Permissions:</strong> {diffResult.permissionChanges.added.join(", ")}
                            </div>
                          )}
                          {diffResult.permissionChanges.removed.length > 0 && (
                            <div className="text-xs font-mono text-danger">
                              <strong>Removed Permissions:</strong> {diffResult.permissionChanges.removed.join(", ")}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Side-by-Side Diff Viewer */}
                      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[440px] border border-line rounded-xl overflow-hidden">
                        {/* File Changes List */}
                        <div className="md:col-span-4 border-r border-line bg-surface2/30 p-2 overflow-y-auto max-h-[480px] space-y-1">
                          <p className="text-[11px] font-mono text-muted uppercase px-2 py-1">Changed Files</p>
                          {diffResult.fileChanges.map((file) => {
                            const isSelected = selectedDiffFile === file.path;
                            return (
                              <button
                                key={file.path}
                                onClick={() => handleSelectDiffFile(file.path)}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs font-mono transition-colors text-left ${
                                  isSelected
                                    ? "bg-brass/20 text-brass border border-brass/40"
                                    : "text-muted hover:text-paper hover:bg-surface"
                                }`}
                              >
                                <span className="truncate">{file.path}</span>
                                <span
                                  className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                    file.status === "added"
                                      ? "bg-teal/20 text-teal"
                                      : file.status === "removed"
                                      ? "bg-danger/20 text-danger"
                                      : file.status === "modified"
                                      ? "bg-amber-400/20 text-amber-400"
                                      : "text-muted/60"
                                  }`}
                                >
                                  {file.status}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Visual Code Diff View */}
                        <div className="md:col-span-8 bg-ink/70 flex flex-col">
                          <div className="p-3 border-b border-line bg-surface flex items-center justify-between text-xs font-mono">
                            <span className="text-paper font-semibold truncate">{selectedDiffFile ?? "Select a file to inspect diff"}</span>
                            <div className="flex items-center gap-2 text-[11px] text-muted">
                              <span className="text-teal font-bold">+ Added</span>
                              <span className="text-danger font-bold">- Removed</span>
                            </div>
                          </div>

                          <div className="flex-1 overflow-auto max-h-[480px] p-2 bg-ink/50 font-mono text-xs">
                            {diffLines && selectedDiffFile ? (
                              <DiffCodeViewer diffLines={diffLines} filename={selectedDiffFile} />
                            ) : (
                              <div className="p-8 text-center text-xs text-muted">Select a file from the list to view line-by-line diff.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 6: Manifest V3 Migration & Health */}
              {activeTab === "mv3" && (
                <div className="p-6 space-y-6">
                  <div className="p-5 rounded-2xl border border-line bg-surface2/50 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg font-bold text-paper">Manifest V3 Migration Score</span>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                            mv3Check?.isMV3 ? "bg-teal/20 text-teal border-teal/30" : "bg-amber-400/20 text-amber-400 border-amber-400/30"
                          }`}
                        >
                          {mv3Check?.isMV3 ? "MV3 Certified" : "MV2 Legacy"}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1">
                        Compliance with modern Chromium extension standards and service worker architectures.
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-3xl font-display font-bold text-paper">{mv3Check?.score ?? 100}</span>
                      <span className="text-xs text-muted font-mono"> / 100</span>
                    </div>
                  </div>

                  {mv3Check && mv3Check.issues.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-display text-sm font-semibold text-paper">Required MV3 Migration Changes</h4>
                      <div className="space-y-2">
                        {mv3Check.issues.map((issue, i) => (
                          <div key={i} className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs">
                            <p className="font-mono font-bold text-amber-300">{issue.field}</p>
                            <p className="text-muted mt-1">{issue.description}</p>
                            <div className="mt-2 p-2 rounded bg-ink font-mono text-[11px] text-teal border border-line">
                              <strong>Remedy:</strong> {issue.remedy}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl border border-teal/30 bg-teal/10 text-teal text-center text-xs">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-teal" />
                      <p className="font-bold text-sm">100% Manifest V3 Compliant</p>
                      <p className="text-muted mt-1">This package utilizes modern Manifest V3 directives with no legacy MV2 bottlenecks.</p>
                    </div>
                  )}

                  {/* Formatted Manifest Inspector */}
                  <div className="border-t border-line pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-display text-sm font-semibold text-paper">Resolved manifest.json</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyManifestJson}
                          className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1"
                        >
                          {copiedManifest ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedManifest ? "Copied" : "Copy JSON"}</span>
                        </button>
                        <button
                          onClick={handleDownloadManifest}
                          className="px-2.5 py-1 rounded bg-surface border border-line text-muted hover:text-paper text-[11px] font-mono flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                    <pre className="p-4 rounded-xl bg-ink border border-line font-mono text-xs text-paper/90 overflow-x-auto max-h-[300px] leading-relaxed">
                      {JSON.stringify(manifestData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {status !== "idle" && (
          <div className="mt-6 text-center">
            <button
              onClick={reset}
              className="focus-ring px-3 py-1.5 rounded-lg border border-line text-xs font-mono text-muted transition-colors hover:text-paper hover:bg-surface"
            >
              ← Clear and start over
            </button>
          </div>
        )}
      </section>

      {/* Visual Reference Guide: Where to find Extension ID */}
      <section className="mx-auto max-w-6xl border-t border-line px-6 py-14">
        <div className="text-center max-w-xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs text-brass font-mono mb-2">
            <Info className="w-4 h-4" />
            <span>Visual Reference</span>
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-paper">
            Where to find any Extension ID
          </h2>
          <p className="text-xs text-muted mt-1">
            Every Chrome extension has a unique 32-character string of lowercase letters (a–p).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Reference Card 1 */}
          <div className="p-6 rounded-2xl border border-line bg-surface flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-brass font-bold mb-3">
                <span className="w-5 h-5 rounded-full bg-brass/20 flex items-center justify-center text-[11px]">1</span>
                <span>From Chrome Web Store URL</span>
              </div>
              <p className="text-xs text-muted leading-relaxed mb-4">
                Open any extension page on the Chrome Web Store. The last 32 letters in the address bar is the ID.
              </p>

              {/* Graphic Mockup */}
              <div className="p-3 rounded-xl bg-ink border border-line font-mono text-xs overflow-x-auto">
                <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-line/40 text-[10px] text-muted">
                  <span className="w-2 h-2 rounded-full bg-danger/80" />
                  <span className="w-2 h-2 rounded-full bg-amber-400/80" />
                  <span className="w-2 h-2 rounded-full bg-teal/80" />
                  <span className="ml-2 truncate text-muted/60">chromewebstore.google.com</span>
                </div>
                <div className="text-[11px] leading-relaxed">
                  <span className="text-muted/60">https://chromewebstore.google.com/detail/name/</span>
                  <span className="text-brass font-bold bg-brass/20 px-1 rounded border border-brass/40">
                    ddkjiahejlhfcafbddmgiahcphecmpfh
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-teal mt-4 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Tip: You can also paste the entire URL directly into GetCRX!</span>
            </p>
          </div>

          {/* Reference Card 2 */}
          <div className="p-6 rounded-2xl border border-line bg-surface flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-brass font-bold mb-3">
                <span className="w-5 h-5 rounded-full bg-brass/20 flex items-center justify-center text-[11px]">2</span>
                <span>From chrome://extensions page</span>
              </div>
              <p className="text-xs text-muted leading-relaxed mb-4">
                Open <code className="text-brass bg-surface2 px-1 py-0.5 rounded">chrome://extensions</code> in Chrome,
                enable <strong>Developer mode</strong> in the top right corner, and the ID appears under each extension.
              </p>

              {/* Graphic Mockup */}
              <div className="p-3 rounded-xl bg-ink border border-line font-mono text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-line/40 text-[10px] text-muted">
                  <span className="text-paper font-medium">uBlock Origin Lite</span>
                  <span className="text-teal text-[10px] bg-teal/10 px-1.5 py-0.5 rounded border border-teal/30">
                    Developer mode ON
                  </span>
                </div>
                <div className="text-[11px]">
                  <span className="text-muted/60">ID: </span>
                  <span className="text-brass font-bold">ddkjiahejlhfcafbddmgiahcphecmpfh</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted/80 mt-4">
              Copy that ID and paste it above to extract the extension.
            </p>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="how" className="mx-auto max-w-6xl border-t border-line px-6 py-16">
        <h2 className="font-display text-2xl font-bold tracking-tight">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <StepCard
            n="01"
            title="Identifier Resolution"
            body="Provide a Chrome Store link, Firefox Add-on URL, 32-character extension ID, or drop a local CRX/XPI file."
          />
          <StepCard
            n="02"
            title="Google / Mozilla CDN Retrieval"
            body="Connects straight to Google or Mozilla's public update infrastructure using native client protocol headers."
          />
          <StepCard
            n="03"
            title="Header Stripping & Audit"
            body="Removes binary CRX2/CRX3 headers in memory, reconstructing clean zip archives for instant browser analysis, code search, and diffing."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl border-t border-line px-6 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-display text-base font-bold text-paper">GetCRX</p>
            <p className="text-xs text-muted mt-0.5">
              Developed & Engineered by <span className="text-brass font-medium">JOJIN JOHN</span>
            </p>
          </div>
          <p className="text-xs text-muted/70 text-center sm:text-right">
            Zero data stored. Processes public browser extension packages ephemerally in-memory.
          </p>
        </div>
      </footer>

      {/* Command Palette Modal (Ctrl+K / Cmd+K) */}
      {showCommandPalette && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 pb-3 border-b border-line">
              <Command className="w-4 h-4 text-brass" />
              <input
                type="text"
                placeholder="Type a command or jump to file..."
                autoFocus
                className="w-full bg-transparent text-xs font-mono text-paper placeholder:text-muted/60 focus:outline-none"
              />
              <button onClick={() => setShowCommandPalette(false)} className="text-muted hover:text-paper">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 space-y-1 text-xs font-mono">
              <button
                onClick={() => {
                  setActiveTab("overview");
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <Eye className="w-3.5 h-3.5 text-brass" />
                <span>Go to Overview & Threat Intel</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("explorer");
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <FileCode className="w-3.5 h-3.5 text-teal" />
                <span>Open Code Explorer</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("security");
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                <span>Run Security Audit & Custom Rules</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("network");
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <Radio className="w-3.5 h-3.5 text-teal" />
                <span>Network & Telemetry Harvester</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("diff");
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <GitCompare className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Package Diff & Comparison Tool</span>
              </button>
              <button
                onClick={() => {
                  setShowEncyclopedia(true);
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <BookOpen className="w-3.5 h-3.5 text-teal" />
                <span>Browse Permissions Encyclopedia</span>
              </button>
              <button
                onClick={() => {
                  handleExportSecurityReport();
                  setShowCommandPalette(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface2 text-left text-paper"
              >
                <FileDown className="w-3.5 h-3.5 text-teal" />
                <span>Export Security Audit Report (.md)</span>
              </button>
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
            className="bg-surface border border-line rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div>
                <h3 className="font-display text-lg font-bold text-paper flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-teal" />
                  <span>Browser Permissions & Threat Model Encyclopedia</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">Comprehensive audit reference for Chrome, Edge, and Firefox API permissions.</p>
              </div>
              <button onClick={() => setShowEncyclopedia(false)} className="text-muted hover:text-paper">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter controls */}
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

            {/* List */}
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

      {/* Modal Dialog for ID Guide */}
      {showIdGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm"
          onClick={() => setShowIdGuide(false)}
        >
          <div
            className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIdGuide(false)}
              className="absolute top-4 right-4 text-muted hover:text-paper"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-display text-lg font-bold text-paper mb-2">How to Find Extension ID</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              Every Chrome extension has a 32-character ID. You can find it using either method:
            </p>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-line bg-surface2">
                <p className="font-semibold text-brass font-mono">Method 1: From Store URL (Easiest)</p>
                <p className="text-muted mt-1 leading-relaxed">
                  Look at the Chrome Web Store URL. The 32 letters at the end is the ID:
                </p>
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
              className="mt-6 w-full py-2.5 rounded-lg bg-brass text-ink font-semibold text-xs hover:bg-brassDim transition-colors"
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

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="p-6 rounded-xl border border-line bg-surface flex flex-col justify-between">
      <div>
        <span className="font-mono text-sm font-bold text-brass">{n}</span>
        <h3 className="font-display text-base font-bold text-paper mt-2">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
      </div>
    </div>
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

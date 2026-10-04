"use client";

import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import {
  extractExtensionId,
  buildCrxDownloadUrl,
  stripCrxHeaderUint8Array,
  classifyPermission
} from "@/lib/crx";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  FileCode,
  FileText,
  Folder,
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
  Info
} from "lucide-react";

type Meta = {
  id: string;
  name: string | null;
  icon: string | null;
  description: string | null;
  notFound: boolean;
};

interface ZipEntryInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

interface ManifestData {
  manifest_version?: number;
  name?: string;
  version?: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  background?: {
    service_worker?: string;
    scripts?: string[];
    page?: string;
  };
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
    css?: string[];
  }>;
  action?: { default_popup?: string; default_title?: string };
  browser_action?: { default_popup?: string; default_title?: string };
}

const POPULAR_EXTENSIONS = [
  { name: "uBlock Lite", id: "ddkjiahejlhfcafbddmgiahcphecmpfh" },
  { name: "Dark Reader", id: "eimadpbcbfnmbkopoojfekhnkhdbieeh" },
  { name: "MetaMask", id: "nkbihfbeogaeaoehlefnkodbefgpgknn" },
  { name: "React DevTools", id: "fmkadmapgofadopljbjfkapdkoienihi" },
  { name: "Wappalyzer", id: "gppongmhjkpfnbhagpmjfkannfbllamg" },
  { name: "Bitwarden", id: "nngceckbapebfimnlniiiahkandclblb" }
];

type ActiveTab = "overview" | "explorer" | "security";

export default function HomeWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ink flex items-center justify-center text-muted">
          Loading GetCRX...
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

  // Archive inspection state
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [zipEntries, setZipEntries] = useState<ZipEntryInfo[]>([]);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [unpackError, setUnpackError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileImageUrl, setFileImageUrl] = useState<string | null>(null);
  const [manifestData, setManifestData] = useState<ManifestData | null>(null);
  const [copiedFile, setCopiedFile] = useState(false);
  const [fileSearch, setFileSearch] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

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

  async function runLookup(inputQuery: string) {
    const id = extractExtensionId(inputQuery);
    if (!id) {
      setErrorMsg("Couldn't find a valid 32-character extension ID or Chrome Store link.");
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
    setFileContent(null);
    setFileImageUrl(null);
    setManifestData(null);
    setActiveTab("overview");

    try {
      const res = await fetch(`/api/meta?q=${encodeURIComponent(id)}`);
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Lookup failed. Verify the extension ID.");
        setStatus("error");
        setIsUnpacking(false);
        return;
      }

      setMeta(data);
      setStatus("found");
      // Fetch and unpack zip in browser for instant inspection
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

      // Parse manifest.json if present
      const manifestFile = zip.file("manifest.json");
      if (manifestFile) {
        const text = await manifestFile.async("text");
        try {
          const parsed = JSON.parse(text);
          setManifestData(parsed);
          if (parsed.name && (!meta?.name || meta.name === "Chrome Web Store")) {
            setMeta((prev) => (prev ? { ...prev, name: parsed.name } : prev));
          }
        } catch {}
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

  // Handle local CRX drag & drop
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

      const manifestFile = zip.file("manifest.json");
      if (manifestFile) {
        const text = await manifestFile.async("text");
        try {
          const parsed = JSON.parse(text);
          setManifestData(parsed);
          if (parsed.name) {
            setMeta((prev) => (prev ? { ...prev, name: parsed.name } : prev));
          }
        } catch {}
      }

      setStatus("found");
      setActiveTab("explorer");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to parse local file. Ensure it is a valid .crx or .zip file.");
      setStatus("error");
    } finally {
      setIsUnpacking(false);
    }
  }

  async function handleSelectFile(path: string) {
    if (!zipInstance) return;
    const file = zipInstance.file(path);
    if (!file) return;

    setSelectedFile(path);
    setFileImageUrl(null);
    setFileContent(null);

    const isImage = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(path);
    if (isImage) {
      const blob = await file.async("blob");
      const url = URL.createObjectURL(blob);
      setFileImageUrl(url);
    } else {
      try {
        const text = await file.async("text");
        setFileContent(text);
      } catch {
        setFileContent("(Binary file — cannot preview text)");
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
    if (!fileContent) return;
    navigator.clipboard.writeText(fileContent);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  }

  function reset() {
    setStatus("idle");
    setMeta(null);
    setErrorMsg(null);
    setQuery("");
    setZipInstance(null);
    setZipEntries([]);
    setSelectedFile(null);
    setFileContent(null);
    setManifestData(null);
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

  const highRiskCount = permissionsList.filter((p) => p.level === "high").length;

  const filteredEntries = useMemo(() => {
    if (!fileSearch.trim()) return zipEntries;
    return zipEntries.filter((e) => e.path.toLowerCase().includes(fileSearch.toLowerCase()));
  }, [zipEntries, fileSearch]);

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
          <p className="mt-4 text-xl font-display font-semibold text-paper">Drop .CRX or .ZIP file to unpack</p>
          <p className="text-sm text-muted">Client-side zero-upload inspection</p>
        </div>
      )}

      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8 pb-4 border-b border-line/40">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <CrateMark />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-bold tracking-tight text-paper">GetCRX</span>
              <span className="text-[10px] font-mono uppercase bg-brass/20 text-brass px-1.5 py-0.5 rounded border border-brass/30">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-muted tracking-tight">Chrome Extension Unpacker & Auditor</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => setShowIdGuide(true)}
            className="focus-ring rounded text-muted transition-colors hover:text-brass flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-brass" />
            <span>How to find Extension ID</span>
          </button>
          <span className="text-line hidden sm:inline-block">|</span>
          <span className="font-mono text-muted text-[11px] hidden sm:inline-block">
            Dev by <span className="text-brass font-medium">JOJIN JOHN</span>
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-6 pt-12 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-surface/80 text-xs text-muted mb-4">
            <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <span>Fast In-Browser Source Inspection & Security Analysis</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-paper">
            Get the raw source of any{" "}
            <span className="bg-gradient-to-r from-brass to-amber-300 bg-clip-text text-transparent">
              Chrome Extension.
            </span>
          </h1>

          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Paste a Chrome Web Store link or extension ID. We fetch the package straight from Google's update CDN,
            strip the CRX wrapper, and give you the unpacked source, live code viewer, and permission audit.
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
                placeholder="Paste Chrome Web Store link, 32-char ID, or drop .crx file"
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
                    className="focus-ring flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-xs font-semibold text-ink transition-all hover:bg-teal/90 disabled:opacity-50"
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
                    <span>Raw .crx</span>
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
              <div className="flex items-center border-b border-line bg-surface px-6 text-xs font-medium">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors ${
                    activeTab === "overview"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>Overview & Details</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab("explorer");
                    if (!selectedFile && zipEntries.length > 0) {
                      const firstCode =
                        zipEntries.find((e) => !e.isDir && e.name.endsWith(".json")) ||
                        zipEntries.find((e) => !e.isDir);
                      if (firstCode) handleSelectFile(firstCode.path);
                    }
                  }}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors ${
                    activeTab === "explorer"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>
                    Code Explorer ({isUnpacking ? "Loading..." : `${zipEntries.filter((e) => !e.isDir).length} files`})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("security")}
                  className={`py-3.5 px-4 border-b-2 flex items-center gap-2 transition-colors ${
                    activeTab === "security"
                      ? "border-brass text-brass"
                      : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Security Audit</span>
                  {highRiskCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-danger/20 text-danger text-[10px] font-mono border border-danger/30">
                      {highRiskCount} High
                    </span>
                  )}
                </button>
              </div>

              {/* Tab 1: Overview */}
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
                          : "Standard Chrome extension format"}
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
                      <p className="text-[11px] font-mono uppercase text-muted">Security Profile</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xl font-bold font-display text-paper">
                          {isUnpacking ? "Scanning..." : `${permissionsList.length} Permissions`}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1">
                        {highRiskCount > 0 ? (
                          <span className="text-danger font-medium">{highRiskCount} high-risk capabilities declared</span>
                        ) : (
                          <span className="text-teal font-medium">Standard security footprint</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Chrome Store Link & Quick Details */}
                  <div className="p-4 rounded-xl border border-line bg-surface2/30 flex items-center justify-between gap-4 flex-wrap text-xs">
                    <div>
                      <p className="text-muted font-mono text-[11px]">Official Chrome Web Store URL:</p>
                      <a
                        href={`https://chromewebstore.google.com/detail/${meta.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brass hover:underline flex items-center gap-1.5 mt-0.5 font-mono"
                      >
                        <span>chromewebstore.google.com/detail/{meta.id}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab("explorer");
                        if (!selectedFile && zipEntries.length > 0) {
                          const firstCode = zipEntries.find((e) => !e.isDir);
                          if (firstCode) handleSelectFile(firstCode.path);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-surface border border-line text-paper hover:bg-surface2 transition-colors flex items-center gap-1.5"
                    >
                      <Code className="w-3.5 h-3.5 text-brass" />
                      <span>Explore Source Code</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Code Explorer */}
              {activeTab === "explorer" && (
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[480px]">
                  {/* File Tree Column */}
                  <div className="md:col-span-4 border-r border-line bg-surface2/30 flex flex-col">
                    <div className="p-3 border-b border-line">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={fileSearch}
                          onChange={(e) => setFileSearch(e.target.value)}
                          placeholder="Search files..."
                          className="w-full bg-surface border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-paper placeholder:text-muted/60 focus:outline-none focus:border-brass/70"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[520px] p-2 space-y-0.5">
                      {isUnpacking ? (
                        <div className="p-8 text-center text-xs text-muted flex flex-col items-center justify-center gap-2">
                          <span className="w-5 h-5 border-2 border-brass border-t-transparent rounded-full animate-spin" />
                          <span>Unpacking extension source...</span>
                        </div>
                      ) : unpackError ? (
                        <div className="p-4 text-xs text-danger text-center">
                          <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-danger" />
                          <p>{unpackError}</p>
                          <button
                            onClick={() => loadZipData(meta.id)}
                            className="mt-2 text-brass underline text-[11px]"
                          >
                            Retry extraction
                          </button>
                        </div>
                      ) : filteredEntries.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted">
                          <p>No files found.</p>
                        </div>
                      ) : (
                        filteredEntries.map((entry) => {
                          const isSelected = selectedFile === entry.path;
                          const isCode = /\.(js|json|html|css|ts|jsx|tsx|md|txt)$/i.test(entry.name);
                          const isImg = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(entry.name);

                          if (entry.isDir) {
                            return (
                              <div
                                key={entry.path}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted font-mono font-medium"
                              >
                                <Folder className="w-3.5 h-3.5 text-brass/70 shrink-0" />
                                <span className="truncate">{entry.path}</span>
                              </div>
                            );
                          }

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

                  {/* Code / Viewer Column */}
                  <div className="md:col-span-8 flex flex-col bg-ink/60">
                    {selectedFile ? (
                      <>
                        <div className="p-3 border-b border-line flex items-center justify-between gap-2 bg-surface/90">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs text-paper truncate font-medium">{selectedFile}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {fileContent && (
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

                        <div className="flex-1 overflow-auto max-h-[520px] p-4 font-mono text-xs text-paper/90 bg-ink/40">
                          {fileImageUrl ? (
                            <div className="flex flex-col items-center justify-center p-8">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fileImageUrl}
                                alt=""
                                className="max-w-[200px] max-h-[200px] rounded border border-line bg-surface p-2 object-contain"
                              />
                              <p className="mt-3 text-xs text-muted">{selectedFile}</p>
                            </div>
                          ) : (
                            <pre className="whitespace-pre-wrap break-words leading-relaxed font-mono">
                              {fileContent ?? "Loading file contents..."}
                            </pre>
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

              {/* Tab 3: Security & Permissions Audit */}
              {activeTab === "security" && (
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="font-display text-base font-semibold text-paper flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brass" />
                      <span>Declared Permissions & Attack Surface</span>
                    </h3>
                    <p className="text-xs text-muted mt-1">
                      Analysis of APIs, hosts, and sensitive data access patterns requested by this extension.
                    </p>
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

                  {/* Architecture & Background Worker Details */}
                  {manifestData && (
                    <div className="border-t border-line pt-6">
                      <h4 className="font-display text-sm font-semibold text-paper mb-3">Runtime Architecture</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                        <div className="p-3 rounded-lg border border-line bg-surface2/30">
                          <span className="text-muted">Background Engine:</span>
                          <p className="text-paper mt-1">
                            {manifestData.background?.service_worker
                              ? `Service Worker (${manifestData.background.service_worker})`
                              : manifestData.background?.scripts
                              ? `Scripts (${manifestData.background.scripts.join(", ")})`
                              : "None"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border border-line bg-surface2/30">
                          <span className="text-muted">Content Scripts:</span>
                          <p className="text-paper mt-1">
                            {manifestData.content_scripts?.length
                              ? `${manifestData.content_scripts.length} injection rule(s)`
                              : "No content scripts injected"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
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
      <section className="mx-auto max-w-5xl border-t border-line px-6 py-14">
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
      <section id="how" className="mx-auto max-w-5xl border-t border-line px-6 py-16">
        <h2 className="font-display text-2xl font-bold tracking-tight">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <StepCard
            n="01"
            title="Identifier Resolution"
            body="Provide a store link, 32-character extension ID, or drop a local CRX file. We parse and normalize the package identity."
          />
          <StepCard
            n="02"
            title="Google CDN Update Call"
            body="Connects straight to Google's public update infrastructure (clients2.google.com) using native Chrome client headers."
          />
          <StepCard
            n="03"
            title="Header Stripping & Audit"
            body="Removes binary CRX2/CRX3 headers in memory, reconstructing the underlying zip archive for instant browser analysis and download."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-5xl border-t border-line px-6 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-display text-base font-bold text-paper">GetCRX</p>
            <p className="text-xs text-muted mt-0.5">
              Developed & Engineered by <span className="text-brass font-medium">JOJIN JOHN</span>
            </p>
          </div>
          <p className="text-xs text-muted/70 text-center sm:text-right">
            Zero data stored. Processes public Google Chrome packages ephemerally in-memory.
          </p>
        </div>
      </footer>

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
            <h3 className="font-display text-lg font-bold text-paper mb-2">How to Find Chrome Extension ID</h3>
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

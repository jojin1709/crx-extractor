"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Meta = {
  id: string;
  name: string | null;
  icon: string | null;
  description: string | null;
  notFound: boolean;
};

type Status = "idle" | "looking" | "found" | "extracting" | "done" | "error";

export default function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setStatus("looking");
    setErrorMsg(null);
    setMeta(null);

    try {
      const res = await fetch(`/api/meta?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Couldn't read that as an extension id or link.");
        setStatus("error");
        return;
      }

      setMeta(data);
      setStatus("found");
    } catch {
      setErrorMsg("Something went wrong reaching the lookup service.");
      setStatus("error");
    }
  }

  async function handleExtract() {
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
      setErrorMsg("Extraction failed partway through. Try again.");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setMeta(null);
    setErrorMsg(null);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="grain" />

      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-10">
        <div className="flex items-center gap-2.5">
          <CrateMark />
          <span className="font-display text-lg font-semibold tracking-tight">Unpacked</span>
        </div>
        <a
          href="#how"
          className="focus-ring rounded text-sm text-muted transition-colors hover:text-paper"
        >
          how it works
        </a>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 sm:pt-24">
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-[2.75rem]">
          Get the raw source of any{" "}
          <span className="text-brass">Chrome extension.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Paste a Chrome Web Store link or a 32-character extension id. We pull the
          published package straight from Google's own update service, strip the
          binary header, and hand you the unpacked source as a zip.
        </p>

        <form onSubmit={handleLookup} className="mt-9">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="chromewebstore.google.com/detail/... or the id itself"
                disabled={status === "looking" || status === "extracting"}
                className="focus-ring w-full rounded-lg border border-line bg-surface px-4 py-3.5 font-mono text-[13px] text-paper placeholder:text-muted/70"
              />
            </div>
            <button
              type="submit"
              disabled={status === "looking" || status === "extracting" || !query.trim()}
              className="focus-ring shrink-0 rounded-lg bg-brass px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-brassDim disabled:opacity-40"
            >
              {status === "looking" ? "Looking it up…" : "Look up"}
            </button>
          </div>
        </form>

        <AnimatePresence mode="wait">
          {status === "error" && errorMsg && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {errorMsg}
            </motion.div>
          )}

          {meta && (status === "found" || status === "extracting" || status === "done") && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mt-6 overflow-hidden rounded-xl border border-line bg-surface"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                {meta.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={meta.icon}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 font-mono text-xs text-muted">
                    ?
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-paper">
                    {meta.name ?? "Unnamed extension"}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">{meta.id}</p>
                </div>

                <div className="relative shrink-0">
                  <button
                    onClick={handleExtract}
                    disabled={status === "extracting"}
                    className="focus-ring rounded-lg border border-teal/40 bg-teal/10 px-4 py-2 text-sm font-medium text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
                  >
                    {status === "extracting" && "Unpacking…"}
                    {status === "found" && "Get source (.zip)"}
                    {status === "done" && "Downloaded ✓"}
                  </button>

                  <UnpackBurst play={status === "extracting"} />
                </div>
              </div>

              {meta.description && (
                <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
                  {meta.description}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {status !== "idle" && (
          <button
            onClick={reset}
            className="focus-ring mt-4 rounded text-xs text-muted transition-colors hover:text-paper"
          >
            start over
          </button>
        )}
      </section>

      <section id="how" className="mx-auto max-w-3xl border-t border-line px-6 py-16">
        <h2 className="font-display text-xl font-semibold">How it works</h2>
        <ol className="mt-6 space-y-6">
          <Step
            n={1}
            title="You give us an id or a link"
            body="Every extension in the Chrome Web Store has a 32-character id in its URL. Paste the whole link — we'll find it."
          />
          <Step
            n={2}
            title="We call Google's own update endpoint"
            body="It's the same public, unauthenticated service every installed Chrome browser quietly checks for extension updates. No scraping tricks, no login."
          />
          <Step
            n={3}
            title="We strip the wrapper and hand you the zip"
            body="A .crx file is a small binary signature glued onto an ordinary zip archive. We remove that header and repackage the rest — manifest, scripts, assets, all of it — as a plain zip you can open anywhere."
          />
        </ol>
      </section>

      <footer className="mx-auto max-w-3xl border-t border-line px-6 py-10">
        <p className="text-xs leading-relaxed text-muted">
          Unpacked only touches packages that are already public in the Chrome Web
          Store. Nothing you paste here is stored, logged, or shared — each request
          is processed and forgotten. Use what you download in line with the
          extension's own license.
        </p>
      </footer>
    </main>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[11px] text-muted">
        {n}
      </span>
      <div>
        <p className="text-sm font-medium text-paper">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

function CrateMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8L12 4L21 8V16L12 20L3 16V8Z"
        stroke="#E8A33D"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3 8L12 12L21 8" stroke="#E8A33D" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12V20" stroke="#E8A33D" strokeWidth="1.6" />
    </svg>
  );
}

/** The one deliberate animated moment: a crate icon bursting into three
 * file glyphs when extraction kicks off, echoing what's actually happening. */
function UnpackBurst({ play }: { play: boolean }) {
  if (!play) return null;
  const pieces = [
    { x: -22, y: -14, r: -18 },
    { x: 0, y: -22, r: 0 },
    { x: 22, y: -14, r: 18 }
  ];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.r, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: i * 0.04 }}
          className="absolute h-2 w-1.5 rounded-[1px] bg-brass"
        />
      ))}
    </div>
  );
}

"use client";

import React, { useMemo } from "react";

interface CodeViewerProps {
  code: string;
  filename: string;
  highlightLine?: number | null;
  wrapLines?: boolean;
}

export function CodeViewer({ code, filename, highlightLine, wrapLines = false }: CodeViewerProps) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const lines = useMemo(() => code.split("\n"), [code]);

  return (
    <div className="font-mono text-[12px] leading-[20px] select-text">
      {lines.map((lineText, idx) => {
        const lineNum = idx + 1;
        const isHighlighted = highlightLine === lineNum;

        return (
          <div
            key={lineNum}
            id={`line-${lineNum}`}
            className={`flex hover:bg-surface2/60 transition-colors ${
              isHighlighted ? "bg-amber-500/20 border-l-2 border-amber-400 font-semibold" : ""
            }`}
          >
            {/* Line Number */}
            <span className="w-12 shrink-0 select-none text-right pr-4 text-muted/40 font-mono text-[11px] select-none py-0.5 border-r border-line/40 bg-surface/30">
              {lineNum}
            </span>

            {/* Line Code */}
            <span
              className={`pl-4 py-0.5 flex-1 ${
                wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre"
              }`}
            >
              <HighlightedTokens text={lineText} ext={ext} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DiffCodeViewer({
  diffLines,
  filename
}: {
  diffLines: Array<{ type: "add" | "del" | "same"; text: string; lineA?: number; lineB?: number }>;
  filename: string;
}) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  return (
    <div className="font-mono text-[12px] leading-[20px] select-text">
      {diffLines.map((line, idx) => {
        const isAdd = line.type === "add";
        const isDel = line.type === "del";

        return (
          <div
            key={idx}
            className={`flex transition-colors ${
              isAdd
                ? "bg-teal/15 text-teal border-l-2 border-teal"
                : isDel
                ? "bg-danger/15 text-danger border-l-2 border-danger opacity-80"
                : "hover:bg-surface2/40"
            }`}
          >
            <span className="w-10 shrink-0 text-right pr-2 text-muted/40 font-mono text-[10px] select-none py-0.5 border-r border-line/30">
              {line.lineA ?? ""}
            </span>
            <span className="w-10 shrink-0 text-right pr-2 text-muted/40 font-mono text-[10px] select-none py-0.5 border-r border-line/30">
              {line.lineB ?? ""}
            </span>
            <span className="w-6 shrink-0 text-center font-bold select-none py-0.5">
              {isAdd ? "+" : isDel ? "-" : " "}
            </span>
            <span className="pl-2 py-0.5 flex-1 whitespace-pre overflow-x-auto">
              {line.type === "same" ? (
                <HighlightedTokens text={line.text} ext={ext} />
              ) : (
                <span>{line.text}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HighlightedTokens({ text, ext }: { text: string; ext: string }) {
  if (!text) return <span>&nbsp;</span>;

  // Simple, robust regex-based tokenization without external wasm bundle overhead
  if (["js", "ts", "jsx", "tsx", "json"].includes(ext)) {
    return <TokenizeJS line={text} isJson={ext === "json"} />;
  }

  if (["html", "xml", "svg"].includes(ext)) {
    return <TokenizeHTML line={text} />;
  }

  if (["css", "scss"].includes(ext)) {
    return <TokenizeCSS line={text} />;
  }

  return <span className="text-paper/90">{text}</span>;
}

function TokenizeJS({ line, isJson }: { line: string; isJson: boolean }) {
  // Regex splitting comments, strings, keywords, numbers, booleans, symbols
  const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|async|await|try|catch|throw|new|typeof|instanceof|switch|case|break|continue|void|this|super|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:+\-*/%=&|^!<>?~])/g;

  const parts = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: line.slice(lastIndex, match.index),
        type: "plain"
      });
    }

    const token = match[0];
    let type = "plain";

    if (token.startsWith("//") || token.startsWith("/*")) {
      type = "comment";
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      type = isJson && token.endsWith('":') ? "json-key" : "string";
    } else if (
      /^(const|let|var|function|return|if|else|for|while|import|from|export|default|class|extends|async|await|try|catch|throw|new|typeof|instanceof|switch|case|break|continue|void|this|super)$/.test(
        token
      )
    ) {
      type = "keyword";
    } else if (/^(true|false|null|undefined)$/.test(token)) {
      type = "boolean";
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      type = "number";
    } else {
      type = "symbol";
    }

    parts.push({ text: token, type });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), type: "plain" });
  }

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "comment") return <span key={i} className="text-muted/60 italic">{p.text}</span>;
        if (p.type === "string") return <span key={i} className="text-amber-300">{p.text}</span>;
        if (p.type === "json-key") return <span key={i} className="text-teal font-medium">{p.text}</span>;
        if (p.type === "keyword") return <span key={i} className="text-rose-400 font-semibold">{p.text}</span>;
        if (p.type === "boolean" || p.type === "number") return <span key={i} className="text-purple-400">{p.text}</span>;
        if (p.type === "symbol") return <span key={i} className="text-muted/80">{p.text}</span>;
        return <span key={i} className="text-paper/90">{p.text}</span>;
      })}
    </>
  );
}

function TokenizeHTML({ line }: { line: string }) {
  const regex = /(<!--[\s\S]*?-->|<\/?[a-zA-Z0-9:-]+|"[^"]*"|'[^']*'|\/?>|[a-zA-Z0-9_-]+(?==))/g;
  const parts = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: line.slice(lastIndex, match.index), type: "plain" });
    }
    const token = match[0];
    let type = "plain";

    if (token.startsWith("<!--")) type = "comment";
    else if (token.startsWith("<")) type = "tag";
    else if (token.startsWith('"') || token.startsWith("'")) type = "string";
    else if (token === ">" || token === "/>") type = "tag";
    else type = "attr";

    parts.push({ text: token, type });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), type: "plain" });
  }

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "comment") return <span key={i} className="text-muted/60 italic">{p.text}</span>;
        if (p.type === "tag") return <span key={i} className="text-rose-400 font-medium">{p.text}</span>;
        if (p.type === "attr") return <span key={i} className="text-teal">{p.text}</span>;
        if (p.type === "string") return <span key={i} className="text-amber-300">{p.text}</span>;
        return <span key={i} className="text-paper/90">{p.text}</span>;
      })}
    </>
  );
}

function TokenizeCSS({ line }: { line: string }) {
  const regex = /(\/\*[\s\S]*?\*\/|[.#]?[a-zA-Z0-9_-]+(?=\s*\{)|[a-zA-Z-]+(?=:)|:[^;]+;|[{};])/g;
  const parts = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: line.slice(lastIndex, match.index), type: "plain" });
    }
    const token = match[0];
    let type = "plain";

    if (token.startsWith("/*")) type = "comment";
    else if (token.startsWith(":")) type = "value";
    else if (token.includes("{")) type = "symbol";
    else type = "prop";

    parts.push({ text: token, type });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), type: "plain" });
  }

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "comment") return <span key={i} className="text-muted/60 italic">{p.text}</span>;
        if (p.type === "prop") return <span key={i} className="text-teal">{p.text}</span>;
        if (p.type === "value") return <span key={i} className="text-amber-300">{p.text}</span>;
        return <span key={i} className="text-paper/90">{p.text}</span>;
      })}
    </>
  );
}

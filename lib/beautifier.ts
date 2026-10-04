/**
 * Lightweight in-browser code beautifier / un-minifier for JavaScript, JSON, CSS, and HTML.
 */

export function beautifyCode(code: string, filename: string): string {
  if (!code || code.trim().length === 0) return code;
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (ext === "json") {
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return code;
    }
  }

  if (["js", "ts", "jsx", "tsx"].includes(ext)) {
    return beautifyJS(code);
  }

  if (["css", "scss"].includes(ext)) {
    return beautifyCSS(code);
  }

  if (["html", "xml", "svg"].includes(ext)) {
    return beautifyHTML(code);
  }

  return code;
}

function beautifyJS(code: string): string {
  let indentLevel = 0;
  const indentStr = "  ";
  let inString: string | null = null;
  let isEscaped = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let output = "";

  const trimmed = code.trim();
  // If it's already well-formatted with multiple line breaks, keep clean
  if (trimmed.split("\n").length > 50 && !trimmed.includes(";;") && !trimmed.startsWith("!function")) {
    // Try basic normalize
  }

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1] || "";
    const prevChar = code[i - 1] || "";

    // Handle comments
    if (!inString && !inSingleLineComment && !inMultiLineComment) {
      if (char === "/" && nextChar === "/") {
        inSingleLineComment = true;
        output += char;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inMultiLineComment = true;
        output += char;
        continue;
      }
    }

    if (inSingleLineComment) {
      output += char;
      if (char === "\n") inSingleLineComment = false;
      continue;
    }

    if (inMultiLineComment) {
      output += char;
      if (char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        output += nextChar;
        i++;
      }
      continue;
    }

    // Handle strings
    if (inString) {
      output += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      output += char;
      continue;
    }

    // Formatting rules
    if (char === "{") {
      indentLevel++;
      output += " {\n" + indentStr.repeat(indentLevel);
      // Skip any consecutive whitespace
      while (code[i + 1] === " " || code[i + 1] === "\t") i++;
    } else if (char === "}") {
      indentLevel = Math.max(0, indentLevel - 1);
      output = output.trimEnd() + "\n" + indentStr.repeat(indentLevel) + "}";
      if (nextChar && nextChar !== ";" && nextChar !== "," && nextChar !== ")") {
        output += "\n" + indentStr.repeat(indentLevel);
      }
    } else if (char === ";") {
      output += ";\n" + indentStr.repeat(indentLevel);
      while (code[i + 1] === " " || code[i + 1] === "\t") i++;
    } else if (char === "," && !inString) {
      output += ", ";
      while (code[i + 1] === " " || code[i + 1] === "\t") i++;
    } else if (char === "\n") {
      if (!output.endsWith("\n")) {
        output += "\n" + indentStr.repeat(indentLevel);
      }
    } else {
      output += char;
    }
  }

  // Cleanup excessive blank lines
  return output
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function beautifyCSS(code: string): string {
  return code
    .replace(/\{/g, " {\n  ")
    .replace(/\}/g, "\n}\n")
    .replace(/;/g, ";\n  ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

function beautifyHTML(code: string): string {
  let indentLevel = 0;
  const indentStr = "  ";
  let output = "";
  const tokens = code.split(/(<[^>]+>)/g).filter(Boolean);

  for (const token of tokens) {
    if (token.startsWith("</")) {
      indentLevel = Math.max(0, indentLevel - 1);
      output += indentStr.repeat(indentLevel) + token + "\n";
    } else if (token.startsWith("<") && !token.endsWith("/>") && !token.startsWith("<!") && !token.startsWith("<?")) {
      const isSelfClosing = /<(img|br|hr|input|meta|link|col|base)/i.test(token);
      output += indentStr.repeat(indentLevel) + token + "\n";
      if (!isSelfClosing) indentLevel++;
    } else if (token.startsWith("<")) {
      output += indentStr.repeat(indentLevel) + token + "\n";
    } else {
      const trimmed = token.trim();
      if (trimmed) {
        output += indentStr.repeat(indentLevel) + trimmed + "\n";
      }
    }
  }

  return output.trim();
}

import JSZip from "jszip";

export interface NetworkEndpoint {
  url: string;
  domain: string;
  protocol: "https" | "http" | "wss" | "ws";
  file: string;
  line: number;
}

export interface NetworkHarvestResult {
  totalEndpoints: number;
  uniqueDomains: string[];
  endpoints: NetworkEndpoint[];
  domainsByCount: Array<{ domain: string; count: number; endpoints: NetworkEndpoint[] }>;
}

const URL_REGEX = /\b(https?|wss?):\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::\d+)?)(\/[^\s"'`<>)\\]*)?/gi;

// Common false positives or schema definitions to filter out
const IGNORE_DOMAINS = new Set([
  "schemas.xmlsoap.org",
  "www.w3.org",
  "json-schema.org",
  "localhost",
  "127.0.0.1"
]);

export async function harvestNetworkEndpoints(zip: JSZip): Promise<NetworkHarvestResult> {
  const endpoints: NetworkEndpoint[] = [];
  const textExts = /\.(js|ts|jsx|tsx|json|html|htm|css)$/i;

  const filePromises: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (file.dir || !textExts.test(relativePath)) return;

    filePromises.push(
      (async () => {
        try {
          const content = await file.async("text");
          const lines = content.split("\n");

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineText = lines[lineIdx];
            URL_REGEX.lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = URL_REGEX.exec(lineText)) !== null) {
              const fullUrl = match[0];
              const protocol = match[1].toLowerCase() as "https" | "http" | "wss" | "ws";
              const domain = match[2].toLowerCase();

              if (IGNORE_DOMAINS.has(domain) || domain.endsWith(".example.com")) {
                continue;
              }

              // Avoid duplicate identical endpoint in same file
              if (!endpoints.some((e) => e.url === fullUrl && e.file === relativePath)) {
                endpoints.push({
                  url: fullUrl,
                  domain,
                  protocol,
                  file: relativePath,
                  line: lineIdx + 1
                });
              }

              if (endpoints.length >= 250) break; // cap for performance
            }
          }
        } catch {}
      })()
    );
  });

  await Promise.all(filePromises);

  // Group by domain
  const domainMap = new Map<string, NetworkEndpoint[]>();
  for (const ep of endpoints) {
    if (!domainMap.has(ep.domain)) {
      domainMap.set(ep.domain, []);
    }
    domainMap.get(ep.domain)!.push(ep);
  }

  const domainsByCount = Array.from(domainMap.entries())
    .map(([domain, eps]) => ({
      domain,
      count: eps.length,
      endpoints: eps
    }))
    .sort((a, b) => b.count - a.count);

  const uniqueDomains = domainsByCount.map((d) => d.domain);

  return {
    totalEndpoints: endpoints.length,
    uniqueDomains,
    endpoints,
    domainsByCount
  };
}

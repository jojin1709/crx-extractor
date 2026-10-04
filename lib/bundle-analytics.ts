// Bundle Composition & Code Metrics Engine

export interface FileTypeStat {
  type: string;
  count: number;
  bytes: number;
  percentage: number;
  color: string;
}

export interface LargestFileStat {
  path: string;
  sizeFormatted: string;
  bytes: number;
  type: string;
}

export interface BundleAnalytics {
  totalFiles: number;
  totalBytes: number;
  totalLOC: number;
  typeStats: FileTypeStat[];
  largestFiles: LargestFileStat[];
  storeRiskPercentile: number; // e.g. 85th percentile (higher than 85% of extensions)
  riskCategoryBadge: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function computeBundleAnalytics(
  files: { path: string; size: number; text?: string }[],
  permissionsCount: number = 0,
  hasAllUrls: boolean = false
): BundleAnalytics {
  let totalBytes = 0;
  let totalLOC = 0;

  const categories: Record<string, { count: number; bytes: number; color: string }> = {
    "JavaScript (.js, .mjs, .ts)": { count: 0, bytes: 0, color: "#e8a33d" },
    "JSON & Manifest": { count: 0, bytes: 0, color: "#4fb6ae" },
    "HTML & Markup": { count: 0, bytes: 0, color: "#ec5d5e" },
    "CSS & Styles": { count: 0, bytes: 0, color: "#7986cb" },
    "Images & Media": { count: 0, bytes: 0, color: "#81c784" },
    "Other Assets": { count: 0, bytes: 0, color: "#928b9a" }
  };

  const fileList: { path: string; bytes: number; type: string }[] = [];

  for (const file of files) {
    const size = file.size || 0;
    totalBytes += size;

    if (file.text) {
      totalLOC += file.text.split(/\r?\n/).length;
    }

    const lower = file.path.toLowerCase();
    let cat = "Other Assets";

    if (lower.match(/\.(js|mjs|ts|jsx|tsx)$/)) {
      cat = "JavaScript (.js, .mjs, .ts)";
    } else if (lower.match(/\.(json)$/)) {
      cat = "JSON & Manifest";
    } else if (lower.match(/\.(html|htm)$/)) {
      cat = "HTML & Markup";
    } else if (lower.match(/\.(css|scss|sass|less)$/)) {
      cat = "CSS & Styles";
    } else if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
      cat = "Images & Media";
    }

    categories[cat].count++;
    categories[cat].bytes += size;
    fileList.push({ path: file.path, bytes: size, type: cat });
  }

  const typeStats: FileTypeStat[] = Object.entries(categories)
    .filter(([_, data]) => data.count > 0)
    .map(([type, data]) => ({
      type,
      count: data.count,
      bytes: data.bytes,
      percentage: totalBytes > 0 ? Math.round((data.bytes / totalBytes) * 100) : 0,
      color: data.color
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const largestFiles: LargestFileStat[] = fileList
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map(f => ({
      path: f.path,
      sizeFormatted: formatBytes(f.bytes),
      bytes: f.bytes,
      type: f.type
    }));

  // Store Risk Percentile calculation based on permission count + broad access
  let percentile = 40;
  if (hasAllUrls) percentile += 35;
  percentile += Math.min(20, permissionsCount * 4);
  percentile = Math.min(99, Math.max(15, percentile));

  let riskCategoryBadge = "Low Risk Profile";
  if (percentile >= 80) riskCategoryBadge = "High Privileges vs Average";
  else if (percentile >= 55) riskCategoryBadge = "Moderate Privileges";

  return {
    totalFiles: files.length,
    totalBytes,
    totalLOC,
    typeStats,
    largestFiles,
    storeRiskPercentile: percentile,
    riskCategoryBadge
  };
}

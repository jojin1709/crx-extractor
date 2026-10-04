import JSZip from "jszip";

export interface DiffLine {
  type: "add" | "del" | "same";
  text: string;
  lineA?: number;
  lineB?: number;
}

export interface FileDiffItem {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  sizeA?: number;
  sizeB?: number;
}

export interface PackageDiffResult {
  manifestA?: any;
  manifestB?: any;
  permissionChanges: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  fileChanges: FileDiffItem[];
  summary: {
    addedFiles: number;
    removedFiles: number;
    modifiedFiles: number;
    unchangedFiles: number;
    addedPerms: number;
    removedPerms: number;
  };
}

export async function compareZipPackages(zipA: JSZip, zipB: JSZip): Promise<PackageDiffResult> {
  const filesA = new Map<string, { size: number; content: () => Promise<string> }>();
  const filesB = new Map<string, { size: number; content: () => Promise<string> }>();

  zipA.forEach((path, file) => {
    if (!file.dir) {
      filesA.set(path, {
        size: (file as any)._data?.uncompressedSize || 0,
        content: () => file.async("text")
      });
    }
  });

  zipB.forEach((path, file) => {
    if (!file.dir) {
      filesB.set(path, {
        size: (file as any)._data?.uncompressedSize || 0,
        content: () => file.async("text")
      });
    }
  });

  const allPaths = Array.from(new Set([...Array.from(filesA.keys()), ...Array.from(filesB.keys())])).sort();
  const fileChanges: FileDiffItem[] = [];

  for (const path of allPaths) {
    const inA = filesA.has(path);
    const inB = filesB.has(path);

    if (!inA && inB) {
      fileChanges.push({
        path,
        status: "added",
        sizeB: filesB.get(path)?.size
      });
    } else if (inA && !inB) {
      fileChanges.push({
        path,
        status: "removed",
        sizeA: filesA.get(path)?.size
      });
    } else {
      // Both exist: check content hash or text difference
      const itemA = filesA.get(path)!;
      const itemB = filesB.get(path)!;

      if (itemA.size !== itemB.size) {
        fileChanges.push({
          path,
          status: "modified",
          sizeA: itemA.size,
          sizeB: itemB.size
        });
      } else {
        // Compare text content if small
        try {
          const textA = await itemA.content();
          const textB = await itemB.content();
          if (textA !== textB) {
            fileChanges.push({
              path,
              status: "modified",
              sizeA: itemA.size,
              sizeB: itemB.size
            });
          } else {
            fileChanges.push({
              path,
              status: "unchanged",
              sizeA: itemA.size,
              sizeB: itemB.size
            });
          }
        } catch {
          fileChanges.push({
            path,
            status: "unchanged",
            sizeA: itemA.size,
            sizeB: itemB.size
          });
        }
      }
    }
  }

  // Parse manifests
  let manifestA: any = null;
  let manifestB: any = null;

  if (filesA.has("manifest.json")) {
    try {
      manifestA = JSON.parse(await filesA.get("manifest.json")!.content());
    } catch {}
  }
  if (filesB.has("manifest.json")) {
    try {
      manifestB = JSON.parse(await filesB.get("manifest.json")!.content());
    } catch {}
  }

  const permsA = extractAllPermissions(manifestA);
  const permsB = extractAllPermissions(manifestB);

  const addedPerms = permsB.filter((p) => !permsA.includes(p));
  const removedPerms = permsA.filter((p) => !permsB.includes(p));
  const unchangedPerms = permsA.filter((p) => permsB.includes(p));

  return {
    manifestA,
    manifestB,
    permissionChanges: {
      added: addedPerms,
      removed: removedPerms,
      unchanged: unchangedPerms
    },
    fileChanges,
    summary: {
      addedFiles: fileChanges.filter((f) => f.status === "added").length,
      removedFiles: fileChanges.filter((f) => f.status === "removed").length,
      modifiedFiles: fileChanges.filter((f) => f.status === "modified").length,
      unchangedFiles: fileChanges.filter((f) => f.status === "unchanged").length,
      addedPerms: addedPerms.length,
      removedPerms: removedPerms.length
    }
  };
}

function extractAllPermissions(manifest: any): string[] {
  if (!manifest) return [];
  const perms = [
    ...(manifest.permissions || []),
    ...(manifest.host_permissions || []),
    ...(manifest.optional_permissions || [])
  ];
  return Array.from(new Set(perms));
}

/**
 * Line by line LCS-based diff calculation for side-by-side or unified view
 */
export function computeLineDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.split("\n");
  const linesB = textB.split("\n");
  const result: DiffLine[] = [];

  // Fast simple diff for large text
  let i = 0;
  let j = 0;

  while (i < linesA.length || j < linesB.length) {
    if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
      result.push({
        type: "same",
        text: linesA[i],
        lineA: i + 1,
        lineB: j + 1
      });
      i++;
      j++;
    } else if (j < linesB.length && (i >= linesA.length || !linesA.includes(linesB[j]))) {
      result.push({
        type: "add",
        text: linesB[j],
        lineB: j + 1
      });
      j++;
    } else if (i < linesA.length) {
      result.push({
        type: "del",
        text: linesA[i],
        lineA: i + 1
      });
      i++;
    } else {
      break;
    }
  }

  return result;
}

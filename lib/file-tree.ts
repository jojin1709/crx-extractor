export interface ZipEntryInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

export function buildFileTree(entries: ZipEntryInfo[]): TreeNode[] {
  const root: TreeNode = {
    name: "root",
    path: "",
    isDir: true,
    size: 0,
    children: []
  };

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          isDir: isLast ? entry.isDir : true,
          size: isLast ? entry.size : 0,
          children: []
        };
        current.children.push(child);
      }

      current = child;
    }
  }

  // Sort nodes: directories first, then alphabetically
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  }

  sortNodes(root.children);
  return root.children;
}

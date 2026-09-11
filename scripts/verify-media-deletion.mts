import assert from "node:assert/strict";

function isStorageFile(input: unknown, workspaceId: string): boolean {
  if (typeof input !== "string" || !input.trim()) return false;
  const val = input.trim();
  if (val.startsWith(`workspaces/${workspaceId}/`)) return true;
  if (val.includes("firebasestorage.googleapis.com") || val.includes("firebasestorage.app")) {
    const match = val.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]);
        return decoded.startsWith(`workspaces/${workspaceId}/`);
      } catch {
        return match[1].startsWith(`workspaces/${workspaceId}/`);
      }
    }
  }
  return false;
}

function extractMediaPathsFromBlocks(blocks: unknown[]): string[] {
  const paths: string[] = [];
  const walk = (list: unknown[]) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const b = item as { media?: { storagePath?: string; url?: string }; children?: unknown[] };
      if (b.media?.storagePath) {
        paths.push(b.media.storagePath);
      } else if (b.media?.url) {
        paths.push(b.media.url);
      }
      if (Array.isArray(b.children) && b.children.length) {
        walk(b.children);
      }
    }
  };
  walk(blocks);
  return paths;
}

function computeRemovedMedia(
  oldBlocks: unknown[],
  newBlocks: unknown[],
  workspaceId: string
): string[] {
  const oldPaths = extractMediaPathsFromBlocks(oldBlocks);
  const newPaths = new Set(extractMediaPathsFromBlocks(newBlocks));
  const removed: string[] = [];
  for (const p of oldPaths) {
    if (!newPaths.has(p) && isStorageFile(p, workspaceId)) {
      removed.push(p);
    }
  }
  return removed;
}

const wsId = "ws_test_123";

assert.equal(
  isStorageFile(`workspaces/${wsId}/uploads/p1/img.png`, wsId),
  true,
  "deve identificar caminho direto de workspace"
);
assert.equal(
  isStorageFile(
    `https://firebasestorage.googleapis.com/v0/b/bucket/o/workspaces%2F${wsId}%2Faudio%2Fp1%2Frec.webm?alt=media`,
    wsId
  ),
  true,
  "deve identificar URL codificada do storage"
);
assert.equal(
  isStorageFile("https://images.unsplash.com/photo-1234", wsId),
  false,
  "não deve identificar URL externa"
);
assert.equal(
  isStorageFile("workspaces/other_ws/uploads/p1/img.png", wsId),
  false,
  "não deve identificar arquivo de outro workspace"
);
assert.equal(isStorageFile("🔥", wsId), false, "não deve identificar emoji");

const oldBlocks = [
  {
    id: "b1",
    type: "paragraph",
    content: "Texto",
  },
  {
    id: "b2",
    type: "image",
    media: {
      storagePath: `workspaces/${wsId}/uploads/p1/photo.png`,
      url: "https://example.com/photo.png",
    },
  },
  {
    id: "b3",
    type: "toggle",
    children: [
      {
        id: "b4",
        type: "audio",
        media: {
          storagePath: `workspaces/${wsId}/audio/p1/note.webm`,
        },
      },
      {
        id: "b5",
        type: "file",
        media: {
          storagePath: `workspaces/${wsId}/uploads/p1/doc.pdf`,
        },
      },
    ],
  },
];

const newBlocksAfterDeletingAudio = [
  {
    id: "b1",
    type: "paragraph",
    content: "Texto",
  },
  {
    id: "b2",
    type: "image",
    media: {
      storagePath: `workspaces/${wsId}/uploads/p1/photo.png`,
      url: "https://example.com/photo.png",
    },
  },
  {
    id: "b3",
    type: "toggle",
    children: [
      {
        id: "b5",
        type: "file",
        media: {
          storagePath: `workspaces/${wsId}/uploads/p1/doc.pdf`,
        },
      },
    ],
  },
];

const removed1 = computeRemovedMedia(oldBlocks, newBlocksAfterDeletingAudio, wsId);
assert.deepEqual(removed1, [`workspaces/${wsId}/audio/p1/note.webm`]);

const newBlocksAfterDeletingAllMedia = [
  {
    id: "b1",
    type: "paragraph",
    content: "Texto apenas",
  },
];

const removed2 = computeRemovedMedia(oldBlocks, newBlocksAfterDeletingAllMedia, wsId);
assert.deepEqual(removed2, [
  `workspaces/${wsId}/uploads/p1/photo.png`,
  `workspaces/${wsId}/audio/p1/note.webm`,
  `workspaces/${wsId}/uploads/p1/doc.pdf`,
]);

const iconStorageUrl = `https://firebasestorage.googleapis.com/v0/b/bucket/o/workspaces%2F${wsId}%2Fuploads%2Ficons%2F123-icon.webp?alt=media`;
const newIconStorageUrl = `https://firebasestorage.googleapis.com/v0/b/bucket/o/workspaces%2F${wsId}%2Fuploads%2Ficons%2F456-icon.webp?alt=media`;

assert.equal(isStorageFile(iconStorageUrl, wsId), true);
assert.equal(isStorageFile(`workspaces/${wsId}/uploads/icons/123-icon.webp`, wsId), true);

function computePageIconRemoval(currentIcon: string | undefined, patchIcon: string | undefined, workspaceId: string): string[] {
  const removed: string[] = [];
  if (patchIcon !== undefined && currentIcon && currentIcon !== patchIcon && isStorageFile(currentIcon, workspaceId)) {
    removed.push(currentIcon);
  }
  return removed;
}

assert.deepEqual(computePageIconRemoval(iconStorageUrl, newIconStorageUrl, wsId), [iconStorageUrl]);
assert.deepEqual(computePageIconRemoval(iconStorageUrl, "📄", wsId), [iconStorageUrl]);
assert.deepEqual(computePageIconRemoval(iconStorageUrl, iconStorageUrl, wsId), []);
assert.deepEqual(computePageIconRemoval("📄", newIconStorageUrl, wsId), []);

function computeNotebookIconRemoval(currentEmoji: string | undefined, patchEmoji: string | undefined, workspaceId: string): string[] {
  const removed: string[] = [];
  if (patchEmoji !== undefined && currentEmoji && currentEmoji !== patchEmoji && isStorageFile(currentEmoji, workspaceId)) {
    removed.push(currentEmoji);
  }
  return removed;
}

assert.deepEqual(computeNotebookIconRemoval(iconStorageUrl, newIconStorageUrl, wsId), [iconStorageUrl]);
assert.deepEqual(computeNotebookIconRemoval(iconStorageUrl, "📓", wsId), [iconStorageUrl]);
assert.deepEqual(computeNotebookIconRemoval(iconStorageUrl, iconStorageUrl, wsId), []);
assert.deepEqual(computeNotebookIconRemoval("📓", newIconStorageUrl, wsId), []);

console.log("Todos os testes de exclusão de mídias passaram com sucesso!");

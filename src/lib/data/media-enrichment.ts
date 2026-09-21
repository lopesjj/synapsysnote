import type { AppBlock, BlockMedia } from "@/types/models";

export interface TranscriptResult {
  transcript: string;
  summary: string;
  actionItems?: string[];
}

export function mediaIdentity(media: {
  storagePath?: string | null;
  url?: string | null;
}): string | null {
  if (media.storagePath) return `path:${media.storagePath}`;
  if (media.url) return `url:${media.url}`;
  return null;
}

export function walkBlocks(blocks: AppBlock[], visit: (block: AppBlock) => void) {
  for (const block of blocks) {
    visit(block);
    if (block.children?.length) walkBlocks(block.children, visit);
  }
}

export function hasMergeableMedia(blocks: AppBlock[]): boolean {
  let found = false;
  walkBlocks(blocks, (block) => {
    if (found || !block.media) return;
    if (mediaIdentity(block.media)) found = true;
  });
  return found;
}

export function indexMedia(blocks: AppBlock[]): Map<string, BlockMedia> {
  const map = new Map<string, BlockMedia>();
  walkBlocks(blocks, (block) => {
    if (!block.media) return;
    const key = mediaIdentity(block.media);
    if (key) map.set(key, block.media);
  });
  return map;
}

export function pendingAudioPaths(blocks: AppBlock[]): string[] {
  const paths: string[] = [];
  walkBlocks(blocks, (block) => {
    if (block.type !== "audio") return;
    if (!block.media?.pending || !block.media.storagePath) return;
    paths.push(block.media.storagePath);
  });
  return paths;
}

export function extractAggregatedTranscripts(blocks: AppBlock[]): string {
  const parts: string[] = [];
  walkBlocks(blocks, (block) => {
    if (
      (block.type === "audio" || block.type === "video") &&
      typeof block.media?.transcript === "string"
    ) {
      const text = block.media.transcript.trim();
      if (text) parts.push(text);
    }
  });
  return parts.join("\n\n");
}

export function isRicherMedia(remote: BlockMedia, local: BlockMedia): boolean {
  if (local.transcript && remote.transcript && local.transcript !== remote.transcript) {
    return false;
  }
  if (remote.transcript && !local.transcript) return true;
  if (remote.transcriptSummary && !local.transcriptSummary) return true;
  if (remote.pending === false && local.pending === true) return true;
  return false;
}

export function stampMedia(local: BlockMedia, remote: BlockMedia): BlockMedia {
  const isTranscriptUpdated = Boolean(
    local.transcript && remote.transcript && local.transcript !== remote.transcript
  );
  return {
    ...local,
    transcript: local.transcript || remote.transcript,
    transcriptSummary: isTranscriptUpdated
      ? local.transcriptSummary
      : local.transcriptSummary || remote.transcriptSummary,
    transcriptLanguage: local.transcriptLanguage || remote.transcriptLanguage,
    transcriptCollapsed:
      typeof local.transcriptCollapsed === "boolean"
        ? local.transcriptCollapsed
        : remote.transcriptCollapsed,
    pending: remote.pending === false && !local.transcript ? false : local.pending,
  };
}

export function mergeMediaEnrichment(localBlocks: AppBlock[], remoteBlocks: AppBlock[]): AppBlock[] {
  const remote = indexMedia(remoteBlocks);

  const map = (blocks: AppBlock[]): AppBlock[] =>
    blocks.map((block) => {
      const children = block.children ? map(block.children) : block.children;
      if (!block.media) {
        return children !== block.children ? { ...block, children } : block;
      }
      const key = mediaIdentity(block.media);
      const match = key ? remote.get(key) : undefined;
      if (!match || !isRicherMedia(match, block.media)) {
        return children !== block.children ? { ...block, children } : block;
      }
      return { ...block, media: stampMedia(block.media, match), ...(children ? { children } : {}) };
    });

  return map(localBlocks);
}

export function stampTranscript(
  blocks: AppBlock[],
  storagePath: string,
  result: TranscriptResult
): AppBlock[] {
  const summary = result.actionItems?.length
    ? `${result.summary} Ações: ${result.actionItems.join("; ")}`
    : result.summary;

  const stamp = (list: AppBlock[]): AppBlock[] =>
    list.map((block) => ({
      ...block,
      ...(block.media?.storagePath === storagePath
        ? {
            media: {
              ...block.media,
              transcript: result.transcript,
              transcriptSummary: summary,
              pending: false,
            },
          }
        : {}),
      ...(block.children ? { children: stamp(block.children) } : {}),
    }));

  return stamp(blocks);
}

export function clearMediaPending(blocks: AppBlock[], storagePath: string): AppBlock[] {
  const stamp = (list: AppBlock[]): AppBlock[] =>
    list.map((block) => ({
      ...block,
      ...(block.media?.storagePath === storagePath
        ? { media: { ...block.media, pending: false } }
        : {}),
      ...(block.children ? { children: stamp(block.children) } : {}),
    }));
  return stamp(blocks);
}

/**
 * Autosave must not wipe a transcript that arrived while the editor still
 * had `pending: true`. Matching is by storage path, not TipTap block id.
 *
 * Run with: npm run verify:media-enrichment
 */

import assert from "node:assert/strict";
import {
  clearMediaPending,
  isRicherMedia,
  mergeMediaEnrichment,
  pendingAudioPaths,
  stampTranscript,
} from "../src/lib/data/media-enrichment";
import type { AppBlock } from "../src/types/models";

function audio(
  id: string,
  media: {
    path?: string;
    pending?: boolean;
    transcript?: string;
    summary?: string;
  }
): AppBlock {
  return {
    id,
    type: "audio",
    media: {
      url: `https://example.test/${media.path ?? id}.webm`,
      storagePath: media.path,
      pending: media.pending,
      transcript: media.transcript,
      transcriptSummary: media.summary,
    },
  };
}

const editorStale = [
  audio("blk_local", { path: "workspaces/ws/audio/p/a.webm", pending: true }),
  { id: "blk_p", type: "paragraph", richText: [{ text: "novo texto" }] },
] satisfies AppBlock[];

const serverDone = [
  audio("blk_server", {
    path: "workspaces/ws/audio/p/a.webm",
    pending: false,
    transcript: "olá mundo",
    summary: "saudação",
  }),
] satisfies AppBlock[];

const merged = mergeMediaEnrichment(editorStale, serverDone);
const media = merged[0]?.media;
assert.equal(media?.pending, false, "pending is cleared when the server finished");
assert.equal(media?.transcript, "olá mundo", "transcript survives an editor save");
assert.equal(media?.transcriptSummary, "saudação");
assert.equal(merged[1]?.richText?.[0]?.text, "novo texto", "local edits are kept");
console.log("  mergeMediaEnrichment: editor pending cannot clobber a transcript");

assert.equal(
  isRicherMedia({ url: "", pending: false, transcript: "x" }, { url: "", pending: true }),
  true
);
assert.equal(
  isRicherMedia({ url: "", pending: true }, { url: "", pending: false, transcript: "x" }),
  false
);

const stamped = stampTranscript(editorStale, "workspaces/ws/audio/p/a.webm", {
  transcript: "oi",
  summary: "resumo",
  actionItems: ["ligar"],
});
assert.equal(stamped[0]?.media?.pending, false);
assert.equal(stamped[0]?.media?.transcript, "oi");
assert.match(stamped[0]?.media?.transcriptSummary ?? "", /ligar/);

const cleared = clearMediaPending(editorStale, "workspaces/ws/audio/p/a.webm");
assert.equal(cleared[0]?.media?.pending, false);

assert.deepEqual(pendingAudioPaths(editorStale), ["workspaces/ws/audio/p/a.webm"]);
assert.deepEqual(pendingAudioPaths(serverDone), []);
console.log("  stamp / clear / pendingAudioPaths: ok");

import assert from "node:assert/strict";
import { mergeBlocks, sameBlocks } from "../src/lib/data/block-merge";
import type { AppBlock } from "../src/types/models";

let seq = 0;
const p = (text: string): AppBlock => ({ id: `b${seq++}`, type: "paragraph", richText: [{ text }] });
const texts = (blocks: AppBlock[]) => blocks.map((block) => block.richText?.[0]?.text ?? block.media?.storagePath);

const base = [p("a"), p("b"), p("c")];

{
  const local = [p("a"), p("b local"), p("c")];
  const remote = [p("a"), p("b"), p("c")];
  const result = mergeBlocks(base, local, remote);
  assert.deepEqual(texts(result.blocks), ["a", "b local", "c"]);
  assert.equal(result.conflict, false);
  console.log("  only local changed: local wins");
}

{
  const local = [p("a"), p("b local"), p("c")];
  const remote = [p("a"), p("b"), p("c remote"), p("d remote")];
  const result = mergeBlocks(base, local, remote);
  assert.deepEqual(texts(result.blocks), ["a", "b local", "c remote", "d remote"]);
  assert.equal(result.conflict, false);
  console.log("  edits on different blocks from both sides are combined");
}

{
  const local = [p("a"), p("b local"), p("c")];
  const remote = [p("a"), p("b remote"), p("c")];
  const result = mergeBlocks(base, local, remote);
  assert.deepEqual(texts(result.blocks), ["a", "b local", "b remote", "c"]);
  assert.equal(result.conflict, true);
  console.log("  same block changed on both sides keeps both versions");
}

{
  const local = [p("a"), p("c")];
  const remote = [p("new"), p("a"), p("b"), p("c")];
  const result = mergeBlocks(base, local, remote);
  assert.deepEqual(texts(result.blocks), ["new", "a", "c"]);
  assert.equal(result.conflict, false);
  console.log("  local deletion and remote insertion both survive");
}

{
  const local = [p("a"), p("b"), p("c"), p("x")];
  const remote = [p("a"), p("b"), p("c"), p("x")];
  const result = mergeBlocks(base, local, remote);
  assert.deepEqual(texts(result.blocks), ["a", "b", "c", "x"]);
  assert.equal(result.conflict, false);
  console.log("  identical changes on both sides are not duplicated");
}

{
  const media = (path: string, transcript?: string): AppBlock => ({
    id: `m${seq++}`,
    type: "audio",
    media: { url: `https://x/${path}`, storagePath: path, transcript },
  });
  const withMedia = [p("a"), media("workspaces/w/audio/p/1.webm")];
  const local = [p("a local"), media("workspaces/w/audio/p/1.webm")];
  const remote = [p("a"), media("workspaces/w/audio/p/1.webm", "texto")];
  const result = mergeBlocks(withMedia, local, remote);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.conflict, false);
  console.log("  media enriched remotely is matched by file, not duplicated");
}

assert.ok(sameBlocks([p("a")], [p("a")]));
assert.ok(!sameBlocks([p("a")], [p("b")]));
console.log("all block merge checks passed");

import type { Clip, Recording } from "../model/types";
import { artworkById } from "../../../shared/catalog";

const MIN_GAP = 4; // 空白至少持续这么久才值得剪掉
const PAD = 1; // 切口两侧各保留的呼吸时间
const MIN_CLIP = 0.8;

type Range = [number, number];

/**
 * 自动检测"走廊空白时段"：没有靠近作品、没有讲解、
 * 没有任何事件的区间。返回剪掉空白后的片段序列。
 */
export function cutEmptyRanges(rec: Recording, makeId: () => string): Clip[] {
  const interests: Range[] = [];
  // 靠近作品的停留
  let open: number | null = null;
  for (const e of rec.events) {
    if (e.kind !== "nearby") continue;
    if (e.id && open === null) open = e.t;
    if (!e.id && open !== null) {
      interests.push([open, e.t]);
      open = null;
    }
  }
  if (open !== null) interests.push([open, rec.duration]);
  // 讲解覆盖的区间
  let narrationOpen: { t: number; id: string; offset: number } | null = null;
  for (const e of rec.events) {
    if (e.kind === "narration") {
      if (narrationOpen) pushNarration(interests, narrationOpen, e.t);
      narrationOpen = { t: e.t, id: e.id, offset: e.offset };
    } else if (e.kind === "narration-stop" && narrationOpen) {
      pushNarration(interests, narrationOpen, e.t);
      narrationOpen = null;
    }
  }
  if (narrationOpen) pushNarration(interests, narrationOpen, rec.duration);
  // 收藏与作品切换是值得保留的瞬间
  for (const e of rec.events) {
    if (e.kind === "favorite" || e.kind === "artwork")
      interests.push([e.t - PAD, e.t + PAD]);
  }
  const merged = merge(interests);
  // 空白 = 兴趣区间的补集；过短的空白不值得剪
  const gaps: Range[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor >= MIN_GAP) gaps.push([cursor + PAD, a - PAD]);
    cursor = b;
  }
  if (rec.duration - cursor >= MIN_GAP)
    gaps.push([cursor + PAD, rec.duration - PAD]);
  // 片段 = 空白的补集
  const clips: Clip[] = [];
  cursor = 0;
  for (const [ga, gb] of gaps) {
    if (gb > ga) {
      pushClip(clips, cursor, ga, makeId);
      cursor = gb;
    }
  }
  pushClip(clips, cursor, rec.duration, makeId);
  return clips.length
    ? clips
    : [{ id: makeId(), sourceStart: 0, sourceEnd: rec.duration }];
}

function pushNarration(
  out: Range[],
  open: { t: number; id: string; offset: number },
  stop: number,
) {
  const a = artworkById(open.id);
  const end = Math.min(stop, open.t + (a ? a.duration - open.offset : 0));
  if (end > open.t) out.push([open.t, end]);
}

function pushClip(
  clips: Clip[],
  start: number,
  end: number,
  makeId: () => string,
) {
  const s = Math.max(0, start);
  const e = Math.max(s, end);
  if (e - s >= MIN_CLIP)
    clips.push({ id: makeId(), sourceStart: s, sourceEnd: e });
}

function merge(ranges: Range[]): Range[] {
  const sorted = ranges
    .map(([a, b]): Range => [Math.max(0, a), Math.max(0, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

import type {
  FilmFrame,
  Recording,
  Edit,
  Segment,
  Timeline,
} from "../model/types";
import {
  artworkAt,
  favoritesAt,
  narrationInClip,
  poseAt,
} from "./sample";
import { buildTransition, transitionPose } from "./transitions";

/**
 * 由原始记录 + 剪辑版本构建影片时间轴：
 * 片段依次排列，相邻片段之间自动生成避障转场。
 */
export function buildTimeline(rec: Recording, edit: Edit): Timeline {
  const segments: Segment[] = [];
  let t = 0;
  edit.clips.forEach((clip, i) => {
    const start = Math.max(0, Math.min(clip.sourceStart, rec.duration));
    const end = Math.max(start, Math.min(clip.sourceEnd, rec.duration));
    if (end - start < 0.05) return;
    const safe = { ...clip, sourceStart: start, sourceEnd: end };
    if (i > 0 && segments.length > 0) {
      const prev = edit.clips[i - 1];
      const from = poseAt(
        rec.keys,
        Math.max(0, Math.min(prev.sourceEnd, rec.duration)),
      );
      const to = poseAt(rec.keys, start);
      const { path, duration } = buildTransition(from, to);
      segments.push({
        kind: "transition",
        start: t,
        end: t + duration,
        from,
        to,
        path,
      });
      t += duration;
    }
    segments.push({ kind: "clip", clip: safe, start: t, end: t + (end - start) });
    t += end - start;
  });
  return { segments, duration: t };
}

export function segmentAt(tl: Timeline, t: number): Segment {
  const found = tl.segments.find((s) => t < s.end);
  return found ?? tl.segments[tl.segments.length - 1];
}

/**
 * 影片某一时刻的完整状态：镜头、作品、字幕、收藏
 * 全部由同一个时间位置驱动。
 */
export function frameAt(rec: Recording, tl: Timeline, t: number): FilmFrame {
  const time = Math.max(0, Math.min(t, tl.duration));
  if (!tl.segments.length) {
    return {
      time: 0,
      segment: { kind: "clip", clip: { id: "", sourceStart: 0, sourceEnd: 0 }, start: 0, end: 0 },
      source: null,
      pose: poseAt(rec.keys, 0),
      artworkId: null,
      narration: null,
      favorites: [],
    };
  }
  const segment = segmentAt(tl, time);
  if (segment.kind === "transition") {
    const k =
      segment.end === segment.start
        ? 1
        : (time - segment.start) / (segment.end - segment.start);
    const pose = transitionPose(segment.path, segment.from, segment.to, k);
    const source = clipEndSource(tl, segment.start);
    return {
      time,
      segment,
      source: null,
      pose,
      artworkId: source === null ? null : artworkAt(rec.events, source),
      narration: null, // 转场中不播放任何讲解，避免跨段泄漏
      favorites: source === null ? [] : favoritesAt(rec.events, source),
    };
  }
  const source = segment.clip.sourceStart + (time - segment.start);
  return {
    time,
    segment,
    source,
    pose: poseAt(rec.keys, source),
    artworkId: artworkAt(rec.events, source),
    narration: narrationInClip(
      rec.events,
      segment.clip.sourceStart,
      source,
    ),
    favorites: favoritesAt(rec.events, source),
  };
}

/** 某影片时刻之前最后一个片段的结尾源时间（供转场继承状态） */
function clipEndSource(tl: Timeline, before: number): number | null {
  let source: number | null = null;
  for (const s of tl.segments) {
    if (s.start >= before) break;
    if (s.kind === "clip") source = s.clip.sourceEnd;
  }
  return source;
}

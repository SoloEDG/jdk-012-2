import type { FilmEvent, Pose, PoseKey } from "../model/types";
import { artworkById } from "../../../shared/catalog";

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 角度插值：走最短弧，避免经过 ±π 时甩头 */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** 在稀疏关键帧上插值出任意时刻的位姿 */
export function poseAt(keys: PoseKey[], t: number): Pose {
  if (keys.length === 0) return { x: 0, z: 6.5, yaw: 0 };
  if (t <= keys[0].t) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return {
    x: lerp(a.x, b.x, k),
    z: lerp(a.z, b.z, k),
    yaw: lerpAngle(a.yaw, b.yaw, k),
  };
}

/** 某时刻生效的作品（全局：最后一个不晚于 t 的作品切换事件） */
export function artworkAt(events: FilmEvent[], t: number): string | null {
  let id: string | null = null;
  for (const e of events) {
    if (e.t > t) break;
    if (e.kind === "artwork") id = e.id;
  }
  return id;
}

/** 某时刻的收藏集合（全局：折叠所有不晚于 t 的收藏事件） */
export function favoritesAt(events: FilmEvent[], t: number): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.t > t) break;
    if (e.kind === "favorite") {
      if (e.on) set.add(e.id);
      else set.delete(e.id);
    }
  }
  return [...set];
}

/**
 * 片段内的讲解状态：只看本片段源区间里的事件。
 * 片段边界处讲解硬性归零——上一段的讲解不会泄漏到下一段。
 */
export function narrationInClip(
  events: FilmEvent[],
  sourceStart: number,
  source: number,
): { id: string; offset: number } | null {
  let active: { id: string; at: number; offset: number } | null = null;
  for (const e of events) {
    if (e.t < sourceStart) continue;
    if (e.t > source) break;
    if (e.kind === "narration") active = { id: e.id, at: e.t, offset: e.offset };
    else if (e.kind === "narration-stop") active = null;
  }
  if (!active) return null;
  const a = artworkById(active.id);
  const offset = active.offset + (source - active.at);
  if (!a || offset >= a.duration) return null;
  return { id: active.id, offset };
}

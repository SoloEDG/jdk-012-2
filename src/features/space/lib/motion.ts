import type { Point } from "../../../shared/types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function constrain(p: Point): Point {
  const q = {
    x: Math.max(-4.8, Math.min(4.8, p.x)),
    z: Math.max(-6.8, Math.min(6.8, p.z)),
  };
  if (Math.abs(q.x) < 1.25 && Math.abs(q.z + 0.3) < 1.1) {
    q.x = q.x < 0 ? -1.25 : 1.25;
  }
  return q;
}
const CORNERS: Point[] = [
  { x: -1.5, z: -1.65 },
  { x: 1.5, z: -1.65 },
  { x: -1.5, z: 1.05 },
  { x: 1.5, z: 1.05 },
];
/**
 * 在可见图上搜索一条不穿墙的路径（绕过中央雕塑与边界约束）。
 * 行走自动寻路与影片转场共用，保证两种镜头都不会穿墙。
 */
export function routePath(from: Point, to: Point): Point[] {
  if (!blocked(from, to)) return [from, to];
  const nodes = [from, ...CORNERS, to];
  const costs = nodes.map(() => Infinity);
  costs[0] = 0;
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  for (let n = 0; n < nodes.length; n++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0 || !Number.isFinite(costs[u])) break;
    visited.add(u);
    for (let v = 0; v < nodes.length; v++)
      if (!blocked(nodes[u], nodes[v])) {
        const cost = costs[u] + distance(nodes[u], nodes[v]);
        if (cost < costs[v]) {
          costs[v] = cost;
          previous[v] = u;
        }
      }
  }
  const last = nodes.length - 1;
  if (previous[last] < 0) return [from, to];
  const path: Point[] = [];
  for (let c = last; c >= 0; c = previous[c]) path.unshift(nodes[c]);
  return path;
}
export function approach(p: Point, target: Point, dt: number): Point {
  const path = routePath(p, target);
  if (path.length > 1) target = path[1];
  const d = distance(p, target);
  if (d < 0.04) return p;
  const k = Math.min(d, dt * 2.5) / d;
  return constrain({
    x: p.x + (target.x - p.x) * k,
    z: p.z + (target.z - p.z) * k,
  });
}
export function viewingPoint(p: Point, facing: number): Point {
  return { x: p.x + Math.sin(facing) * 2, z: p.z + Math.cos(facing) * 2 };
}

function blocked(a: Point, b: Point): boolean {
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    if (Math.abs(x) < 1.3 && z > -1.45 && z < 0.85) return true;
  }
  return false;
}

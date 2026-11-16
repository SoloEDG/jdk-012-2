import type { Point } from "../../../shared/types";
import type { Pose } from "../model/types";
import { constrain, distance, routePath } from "../../space/lib/motion";
import { lerpAngle } from "./sample";

const WALK_SPEED = 2.5; // 与行走速度一致，转场不突兀
const MIN_TRANSITION = 0.6;
const MAX_TRANSITION = 5;

export type TransitionSample = { dt: number; pose: Pose };

/**
 * 跨片段转场：沿 routePath 的避障路径匀速移动，朝向平滑转向。
 * 镜头从上一段结尾走到下一段开头，全程不穿墙。
 */
export function buildTransition(from: Pose, to: Pose) {
  const path = routePath(constrain(from), constrain(to));
  let length = 0;
  for (let i = 1; i < path.length; i++) length += distance(path[i - 1], path[i]);
  const duration = Math.min(
    MAX_TRANSITION,
    Math.max(MIN_TRANSITION, length / WALK_SPEED),
  );
  return { path, duration };
}

/** 转场内某一相对时刻（0..1）的位姿：沿路径匀速 + 朝向插值 */
export function transitionPose(
  path: Point[],
  from: Pose,
  to: Pose,
  k: number,
): Pose {
  let total = 0;
  const legs: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const d = distance(path[i - 1], path[i]);
    legs.push(d);
    total += d;
  }
  let remain = total * Math.min(1, Math.max(0, k));
  let x = path[0].x;
  let z = path[0].z;
  for (let i = 0; i < legs.length; i++) {
    if (remain <= legs[i] || i === legs.length - 1) {
      const f = legs[i] === 0 ? 0 : Math.min(1, remain / legs[i]);
      x = path[i].x + (path[i + 1].x - path[i].x) * f;
      z = path[i].z + (path[i + 1].z - path[i].z) * f;
      break;
    }
    remain -= legs[i];
  }
  const p = constrain({ x, z });
  return { x: p.x, z: p.z, yaw: lerpAngle(from.yaw, to.yaw, k) };
}

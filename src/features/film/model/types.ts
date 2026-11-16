import type { Point } from "../../../shared/types";

/** 位姿关键帧：稀疏采样，回放时插值还原连续运动 */
export type PoseKey = { t: number; x: number; z: number; yaw: number };

/** 离散事件：精确落点，不参与插值 */
export type FilmEvent =
  | { t: number; kind: "artwork"; id: string | null }
  | { t: number; kind: "nearby"; id: string | null }
  | { t: number; kind: "narration"; id: string; offset: number }
  | { t: number; kind: "narration-stop" }
  | { t: number; kind: "favorite"; id: string; on: boolean };

/** 一次参观的原始记录（不可变，剪辑只引用不修改） */
export type Recording = {
  id: string;
  startedAt: number;
  duration: number;
  keys: PoseKey[];
  events: FilmEvent[];
};

/** 剪辑片段：引用原始记录中的一段时间 [sourceStart, sourceEnd) */
export type Clip = {
  id: string;
  sourceStart: number;
  sourceEnd: number;
};

/** 当前剪辑版本：片段按播放顺序排列 */
export type Edit = { clips: Clip[] };

export type Pose = Point & { yaw: number };

/** 影片时间轴上的一个段落：正片片段或自动生成的安全转场 */
export type Segment =
  | { kind: "clip"; clip: Clip; start: number; end: number }
  | {
      kind: "transition";
      start: number;
      end: number;
      from: Pose;
      to: Pose;
      path: Point[];
    };

export type Timeline = { segments: Segment[]; duration: number };

/** 某一影片时刻的全部可回放状态（由同一时间位置驱动） */
export type FilmFrame = {
  time: number;
  segment: Segment;
  /** 片段内对应的原始记录时间；转场时为 null */
  source: number | null;
  pose: Pose;
  artworkId: string | null;
  narration: { id: string; offset: number } | null;
  favorites: string[];
};

export type FilmDocument = {
  recording: Recording | null;
  edit: Edit;
  recordingActive: boolean;
  playhead: number;
};

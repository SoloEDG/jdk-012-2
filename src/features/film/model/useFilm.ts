import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Clip,
  Edit,
  FilmEvent,
  FilmFrame,
  Pose,
  PoseKey,
  Recording,
} from "../model/types";
import { buildTimeline, frameAt } from "../lib/timeline";
import { cutEmptyRanges } from "../lib/empty";
import { loadFilm, saveFilm } from "../lib/storage";

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export type RecordSeed = {
  getPose: () => Pose;
  artworkId: string | null;
  nearbyId: string | null;
  favorites: string[];
  narration: { id: string; offset: number } | null;
};

const SAMPLE_MS = 200; // 稀疏采样：运动 5Hz，静止 1Hz 心跳
const HEARTBEAT = 1;
const MOVE_EPS = 0.02;
const YAW_EPS = 0.02;

export function useFilm() {
  const [initial] = useState(() => {
    const d = loadFilm();
    // 上次刷新/中断时还在录制：把已落盘的部分定稿为一条完整记录
    if (d.recordingActive && d.recording && d.recording.keys.length) {
      const lastKey = d.recording.keys[d.recording.keys.length - 1].t;
      const lastEvent = d.recording.events.length
        ? d.recording.events[d.recording.events.length - 1].t
        : 0;
      const duration = Math.max(lastKey, lastEvent, 0.1);
      return {
        recording: { ...d.recording, duration },
        edit: {
          clips: [{ id: uid(), sourceStart: 0, sourceEnd: duration }],
        },
        playhead: 0,
      };
    }
    return d;
  });
  const [recording, setRecording] = useState<Recording | null>(
    initial.recording,
  );
  const [edit, setEdit] = useState<Edit>(initial.edit);
  const [recActive, setRecActive] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(() =>
    initial.recording ? Math.min(initial.playhead, initial.recording.duration) : 0,
  );
  const [past, setPast] = useState<Edit[]>([]);

  const timeRef = useRef(time);
  const keys = useRef<PoseKey[]>([]);
  const events = useRef<FilmEvent[]>([]);
  const clockStart = useRef(0);
  const seed = useRef<RecordSeed | null>(null);

  const now = () => (performance.now() - clockStart.current) / 1000;

  /* ---------- 录制 ---------- */

  const pushEvent = (e: FilmEvent) => {
    events.current.push(e);
    events.current.sort((a, b) => a.t - b.t);
  };

  const sampleKey = (force = false) => {
    const pose = seed.current?.getPose();
    if (!pose) return;
    const t = now();
    const last = keys.current[keys.current.length - 1];
    const moved =
      !last ||
      Math.hypot(pose.x - last.x, pose.z - last.z) > MOVE_EPS ||
      Math.abs(pose.yaw - last.yaw) > YAW_EPS;
    if (force || moved || t - (last?.t ?? 0) >= HEARTBEAT)
      keys.current.push({ t, x: pose.x, z: pose.z, yaw: pose.yaw });
  };

  useEffect(() => {
    if (!recActive) return;
    let tick = 0;
    const iv = setInterval(() => {
      sampleKey();
      setRecElapsed(now());
      if (++tick % 10 === 0) persistPartial();
    }, SAMPLE_MS);
    return () => clearInterval(iv);
  }, [recActive]);

  const persistPartial = () => {
    saveFilm({
      recording: {
        id: "rec-" + clockStart.current,
        startedAt: Date.now(),
        duration: now(),
        keys: keys.current,
        events: events.current,
      },
      edit: { clips: [] },
      recordingActive: true,
      playhead: 0,
    });
  };

  const startRecording = (s: RecordSeed) => {
    if (recActive || playbackActive) return;
    keys.current = [];
    events.current = [];
    seed.current = s;
    clockStart.current = performance.now();
    const pose = s.getPose();
    keys.current.push({ t: 0, x: pose.x, z: pose.z, yaw: pose.yaw });
    pushEvent({ t: 0, kind: "artwork", id: s.artworkId });
    pushEvent({ t: 0, kind: "nearby", id: s.nearbyId });
    for (const id of s.favorites)
      pushEvent({ t: 0, kind: "favorite", id, on: true });
    if (s.narration)
      pushEvent({
        t: 0,
        kind: "narration",
        id: s.narration.id,
        offset: s.narration.offset,
      });
    setPast([]);
    setRecElapsed(0);
    setRecActive(true);
  };

  const stopRecording = () => {
    if (!recActive) return;
    sampleKey(true);
    const duration = Math.max(now(), 0.1);
    const rec: Recording = {
      id: uid(),
      startedAt: Date.now(),
      duration,
      keys: keys.current,
      events: events.current,
    };
    keys.current = [];
    events.current = [];
    seed.current = null;
    setRecActive(false);
    setRecording(rec);
    setEdit({ clips: [{ id: uid(), sourceStart: 0, sourceEnd: duration }] });
    setPast([]);
    setTime(0);
    timeRef.current = 0;
  };

  const log = {
    artwork: (id: string | null) => {
      if (recActive) pushEvent({ t: now(), kind: "artwork", id });
    },
    nearby: (id: string | null) => {
      if (recActive) pushEvent({ t: now(), kind: "nearby", id });
    },
    narration: (id: string, offset: number) => {
      if (recActive) pushEvent({ t: now(), kind: "narration", id, offset });
    },
    narrationStop: () => {
      if (recActive) pushEvent({ t: now(), kind: "narration-stop" });
    },
    favorite: (id: string, on: boolean) => {
      if (recActive) pushEvent({ t: now(), kind: "favorite", id, on });
    },
  };

  /* ---------- 剪辑 ---------- */

  const mutate = (next: Edit) => {
    setPast((p) => [...p.slice(-19), edit]);
    setEdit(next);
  };

  const autoCut = () => {
    if (recording) mutate({ clips: cutEmptyRanges(recording, uid) });
  };
  const removeClip = (id: string) =>
    mutate({ clips: edit.clips.filter((c) => c.id !== id) });
  const moveClip = (id: string, dir: -1 | 1) => {
    const i = edit.clips.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= edit.clips.length) return;
    const clips = [...edit.clips];
    [clips[i], clips[j]] = [clips[j], clips[i]];
    mutate({ clips });
  };
  const resetEdit = () => {
    if (recording)
      mutate({
        clips: [{ id: uid(), sourceStart: 0, sourceEnd: recording.duration }],
      });
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setEdit(prev);
  };

  /* ---------- 回放 ---------- */

  const timeline = useMemo(
    () =>
      recording
        ? buildTimeline(recording, edit)
        : { segments: [], duration: 0 },
    [recording, edit],
  );

  useEffect(() => {
    if (timeRef.current > timeline.duration) {
      timeRef.current = timeline.duration;
      setTime(timeline.duration);
    }
  }, [timeline.duration]);

  useEffect(() => {
    if (!playbackActive || !playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (nowMs: number) => {
      const dt = Math.min((nowMs - last) / 1000, 0.1);
      last = nowMs;
      timeRef.current = Math.min(timeline.duration, timeRef.current + dt);
      setTime(timeRef.current);
      if (timeRef.current >= timeline.duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playbackActive, playing, timeline.duration]);

  const frame: FilmFrame | null = useMemo(
    () =>
      playbackActive && recording ? frameAt(recording, timeline, time) : null,
    [playbackActive, recording, timeline, time],
  );

  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(t, timeline.duration));
    setTime(timeRef.current);
  };

  /** 拖动讲解进度 = 把影片时钟定位到当前片段内讲解的对应位置 */
  const seekNarration = (offset: number) => {
    if (!recording || !frame || frame.segment.kind !== "clip") return;
    const clip = frame.segment.clip;
    const source = frame.source ?? clip.sourceStart;
    let start: number | null = null;
    for (const e of recording.events) {
      if (e.t < clip.sourceStart) continue;
      if (e.t > source) break;
      if (e.kind === "narration") start = e.t;
      else if (e.kind === "narration-stop") start = null;
    }
    if (start === null) return;
    const target = Math.max(
      clip.sourceStart,
      Math.min(start + offset, clip.sourceEnd - 0.05),
    );
    seek(frame.segment.start + (target - clip.sourceStart));
  };

  const enterPlayback = () => {
    if (!recording || recActive || timeline.duration <= 0) return;
    if (timeRef.current >= timeline.duration - 0.01) seek(0);
    setPlaybackActive(true);
    setPlaying(true);
  };
  const exitPlayback = () => {
    setPlaybackActive(false);
    setPlaying(false);
  };
  const togglePlay = () => {
    if (!playing && timeRef.current >= timeline.duration - 0.01) seek(0);
    setPlaying(!playing);
  };

  /* ---------- 持久化：原始记录与剪辑版本分别恢复 ---------- */

  useEffect(() => {
    saveFilm({
      recording,
      edit,
      recordingActive: recActive,
      playhead: timeRef.current,
    });
  }, [recording, edit, recActive, playbackActive, playing]);

  // 回放中定期落盘播放位置，刷新后从最近处继续
  useEffect(() => {
    if (!playbackActive) return;
    const iv = setInterval(() => {
      saveFilm({
        recording,
        edit,
        recordingActive: false,
        playhead: timeRef.current,
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [playbackActive, recording, edit]);

  return {
    recording,
    edit,
    timeline,
    frame,
    rec: { active: recActive, elapsed: recElapsed },
    playback: {
      active: playbackActive,
      playing,
      time,
      duration: timeline.duration,
    },
    startRecording,
    stopRecording,
    log,
    autoCut,
    removeClip,
    moveClip,
    resetEdit,
    undo,
    canUndo: past.length > 0,
    seek,
    seekNarration,
    togglePlay,
    enterPlayback,
    exitPlayback,
  };
}

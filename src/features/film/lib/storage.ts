import type { Edit, FilmDocument, Recording } from "../model/types";

const key = "yujing-film-v1";

export const emptyFilm = (): FilmDocument => ({
  recording: null,
  edit: { clips: [] },
  recordingActive: false,
  playhead: 0,
});

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function loadRecording(d: unknown): Recording | null {
  const r = d as Recording;
  if (!r || typeof r !== "object") return null;
  if (typeof r.id !== "string" || !num(r.duration)) return null;
  const keys = Array.isArray(r.keys)
    ? r.keys.filter(
        (k) => k && num(k.t) && num(k.x) && num(k.z) && num(k.yaw),
      )
    : [];
  const events = Array.isArray(r.events)
    ? r.events.filter((e) => e && num(e.t) && typeof e.kind === "string")
    : [];
  keys.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);
  return {
    id: r.id,
    startedAt: num(r.startedAt) ? r.startedAt : Date.now(),
    duration: r.duration,
    keys,
    events,
  };
}

function loadEdit(d: unknown, rec: Recording | null): Edit {
  const e = d as Edit;
  if (!e || !Array.isArray(e.clips) || !rec) return { clips: [] };
  const clips = e.clips
    .filter((c) => c && num(c.sourceStart) && num(c.sourceEnd))
    .map((c, i) => ({
      id: typeof c.id === "string" ? c.id : `clip-${i}`,
      sourceStart: Math.max(0, Math.min(c.sourceStart, rec.duration)),
      sourceEnd: Math.max(0, Math.min(c.sourceEnd, rec.duration)),
    }))
    .filter((c) => c.sourceEnd - c.sourceStart >= 0.05);
  return { clips };
}

export function loadFilm(): FilmDocument {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null");
    if (!d) return emptyFilm();
    const recording = loadRecording(d.recording);
    return {
      recording,
      edit: loadEdit(d.edit, recording),
      recordingActive: d.recordingActive === true,
      playhead: num(d.playhead) ? d.playhead : 0,
    };
  } catch {
    return emptyFilm();
  }
}

export function saveFilm(d: FilmDocument): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

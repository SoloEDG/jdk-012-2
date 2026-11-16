import {
  Clapperboard,
  Circle,
  ArrowUp,
  ArrowDown,
  X,
  Play,
  Pause,
  Scissors,
  Undo2,
  RotateCcw,
  Square,
  LogOut,
} from "lucide-react";
import type { Clip, Recording, Timeline } from "../model/types";
import { artworkById } from "../../../shared/catalog";
import { formatTime } from "../../narration/lib/timeline";

function clipLabel(rec: Recording, clip: Clip): string {
  const titles: string[] = [];
  for (const e of rec.events) {
    if (e.t < clip.sourceStart || e.t >= clip.sourceEnd) continue;
    if (e.kind === "artwork" && e.id) {
      const a = artworkById(e.id);
      if (a && !titles.includes(a.title)) titles.push(a.title);
    }
  }
  if (!titles.length) return "走廊 · 途中";
  return titles.slice(0, 2).join("、") + (titles.length > 2 ? " 等" : "");
}

export function FilmPanel({
  recording,
  clips,
  timeline,
  rec,
  playback,
  segmentLabel,
  onStartRecord,
  onStopRecord,
  onEnterPlayback,
  onExitPlayback,
  onTogglePlay,
  onSeek,
  onAutoCut,
  onRemoveClip,
  onMoveClip,
  onReset,
  onUndo,
  canUndo,
}: {
  recording: Recording | null;
  clips: Clip[];
  timeline: Timeline;
  rec: { active: boolean; elapsed: number };
  playback: { active: boolean; playing: boolean; time: number; duration: number };
  segmentLabel: string;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onEnterPlayback: () => void;
  onExitPlayback: () => void;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onAutoCut: () => void;
  onRemoveClip: (id: string) => void;
  onMoveClip: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  return (
    <section className="film-panel">
      <div className="section-title">
        <Clapperboard size={16} />
        <span>漫游影片</span>
        <small>VISIT FILM</small>
      </div>

      {rec.active ? (
        <div className="film-recording">
          <span className="rec-dot" />
          录制中 · {formatTime(rec.elapsed)}
          <button className="film-stop" onClick={onStopRecord}>
            <Square size={12} />
            停止并保存
          </button>
        </div>
      ) : (
        <button
          className="film-record-button"
          onClick={onStartRecord}
          disabled={playback.active}
        >
          <Circle size={12} fill="currentColor" />
          {recording ? "重新录制（覆盖当前影片）" : "开始录制这次参观"}
        </button>
      )}

      {recording && !rec.active && (
        <>
          <div className="film-meta">
            <span>
              原始记录 <strong>{formatTime(recording.duration)}</strong>
            </span>
            <span>
              剪辑后 <strong>{formatTime(timeline.duration)}</strong>
            </span>
            <span>
              <strong>{clips.length}</strong> 个片段
            </span>
          </div>

          {playback.active ? (
            <div className="film-playback">
              <div className="film-playback-row">
                <button
                  className="play-button"
                  aria-label={playback.playing ? "暂停影片" : "播放影片"}
                  onClick={onTogglePlay}
                >
                  {playback.playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <span className="time">
                  {formatTime(playback.time)} / {formatTime(playback.duration)}
                </span>
                <span className="film-segment-label">{segmentLabel}</span>
              </div>
              <input
                aria-label="影片进度"
                type="range"
                min="0"
                max={playback.duration || 1}
                step="0.05"
                value={playback.time}
                onChange={(e) => onSeek(Number(e.target.value))}
              />
              <button className="text-button" onClick={onExitPlayback}>
                <LogOut size={13} />
                退出回放 · 回到自由探索
              </button>
            </div>
          ) : (
            <button
              className="primary full film-watch"
              onClick={onEnterPlayback}
              disabled={!timeline.duration}
            >
              <Play size={15} />
              观看影片
            </button>
          )}

          <div className="film-clips">
            {clips.map((c, i) => (
              <div className="film-clip" key={c.id}>
                <span className="film-clip-index">{String(i + 1).padStart(2, "0")}</span>
                <span className="film-clip-info">
                  <strong>{clipLabel(recording, c)}</strong>
                  <small>
                    {formatTime(c.sourceStart)}–{formatTime(c.sourceEnd)} ·{" "}
                    {formatTime(c.sourceEnd - c.sourceStart)}
                  </small>
                </span>
                <span className="film-clip-ops">
                  <button
                    aria-label="上移片段"
                    disabled={i === 0}
                    onClick={() => onMoveClip(c.id, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label="下移片段"
                    disabled={i === clips.length - 1}
                    onClick={() => onMoveClip(c.id, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    aria-label="删除片段"
                    onClick={() => onRemoveClip(c.id)}
                  >
                    <X size={13} />
                  </button>
                </span>
              </div>
            ))}
            {!clips.length && (
              <p className="film-empty">片段已全部删除，可撤销或还原。</p>
            )}
          </div>

          <div className="film-edit-ops">
            <button onClick={onAutoCut}>
              <Scissors size={13} />
              剪掉空白时段
            </button>
            <button onClick={onUndo} disabled={!canUndo}>
              <Undo2 size={13} />
              撤销
            </button>
            <button onClick={onReset}>
              <RotateCcw size={13} />
              还原
            </button>
          </div>
          <p className="film-hint">
            跨片段镜头自动绕开墙体；讲解只在其所属片段内播放。原始记录与剪辑保存在本机，刷新后恢复。
          </p>
        </>
      )}
      {!recording && !rec.active && (
        <p className="film-hint">
          录制会保存行走轨迹、转向、作品切换、讲解与收藏标记，之后可回放与重新剪辑。
        </p>
      )}
    </section>
  );
}

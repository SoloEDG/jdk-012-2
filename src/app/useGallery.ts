import { useEffect, useRef } from "react";
import { useWalker, distance, viewingPoint } from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour } from "../features/tours";
import { useCollection } from "../features/collection";
import { useFilm } from "../features/film";
import { artworkById } from "../shared/catalog";
import { captionAt } from "../features/narration/lib/timeline";
import { speak, stopSpeech } from "../features/narration/lib/speech";
import type { AudioState, Point } from "../shared/types";

export function useGallery() {
  const catalog = useCatalog();
  const tour = useTour();
  const collection = useCollection();
  const walker = useWalker(catalog.observe);
  const film = useFilm();
  const narration = useNarration(() => {
    if (tour.state.phase === "listening") tour.next();
  });

  const go = (id: string) => {
    if (film.playback.active) return; // 回放中镜头由影片时钟驱动
    const a = artworkById(id);
    if (a) {
      catalog.select(id);
      walker.go(viewingPoint(a.position, a.facing));
      walker.yaw.current = a.facing;
    }
  };

  useEffect(() => {
    if (film.playback.active) return;
    if (tour.state.phase === "walking" && tour.target) go(tour.target);
  }, [tour.state.phase, tour.target, film.playback.active]);
  useEffect(() => {
    if (tour.state.phase !== "walking" || !tour.target) return;
    const a = artworkById(tour.target)!;
    if (distance(walker.position, viewingPoint(a.position, a.facing)) < 0.15) {
      tour.arrive();
      narration.play(a.id);
    }
  }, [walker.position, tour.state.phase, tour.target]);

  /* ---------- 录制：把现场动作落成稀疏关键帧 + 精确事件 ---------- */

  const filmLog = useRef(film.log);
  filmLog.current = film.log;

  useEffect(() => {
    filmLog.current.artwork(catalog.active);
  }, [catalog.active]);
  useEffect(() => {
    filmLog.current.nearby(catalog.nearby);
  }, [catalog.nearby]);

  const prevNarration = useRef(narration.state);
  useEffect(() => {
    const p = prevNarration.current;
    const s = narration.state;
    prevNarration.current = s;
    if (s.playing && s.artworkId && (!p.playing || p.artworkId !== s.artworkId))
      filmLog.current.narration(s.artworkId, s.elapsed);
    else if (
      s.playing &&
      p.playing &&
      s.artworkId &&
      s.artworkId === p.artworkId &&
      Math.abs(s.elapsed - p.elapsed) > 1
    )
      filmLog.current.narration(s.artworkId, s.elapsed); // 拖动讲解进度
    else if (!s.playing && p.playing) filmLog.current.narrationStop();
  }, [narration.state]);

  const toggleFavorite = (id: string) => {
    if (film.playback.active) return; // 回放不计入真实收藏
    filmLog.current.favorite(
      id,
      !collection.document.favorites.includes(id),
    );
    collection.toggle(id);
  };

  const startRecording = () => {
    film.startRecording({
      getPose: () => ({
        ...walker.positionRef.current,
        yaw: walker.yaw.current,
      }),
      artworkId: catalog.active,
      nearbyId: catalog.nearby,
      favorites: collection.document.favorites,
      narration:
        narration.state.playing && narration.state.artworkId
          ? { id: narration.state.artworkId, offset: narration.state.elapsed }
          : null,
    });
  };

  /* ---------- 回放：同一时间位置驱动镜头、字幕与作品介绍 ---------- */

  const frame = film.frame;
  useEffect(() => {
    if (!frame) return;
    walker.setPose(frame.pose, frame.pose.yaw);
    catalog.select(frame.artworkId);
  }, [frame]);

  const filmNarration = frame?.narration ?? null;
  const filmArtwork = artworkById(filmNarration?.id ?? null);
  const filmCaption =
    filmArtwork && filmNarration
      ? captionAt(filmArtwork, filmNarration.offset)
      : "";
  useEffect(() => {
    if (!film.playback.active) return;
    if (film.playback.playing && filmCaption) speak(filmCaption, 1);
    else stopSpeech();
    return stopSpeech;
  }, [filmCaption, film.playback.playing, film.playback.active]);

  const snapshot = useRef<{
    pos: Point;
    yaw: number;
    narration: AudioState;
    active: string | null;
  } | null>(null);

  const enterPlayback = () => {
    if (
      film.playback.active ||
      film.rec.active ||
      !film.recording ||
      !film.timeline.duration
    )
      return;
    snapshot.current = {
      pos: walker.positionRef.current,
      yaw: walker.yaw.current,
      narration: narration.state,
      active: catalog.active,
    };
    if (tour.state.phase === "walking" || tour.state.phase === "listening")
      tour.pause();
    narration.pause();
    walker.possess();
    film.enterPlayback();
  };

  const exitPlayback = () => {
    film.exitPlayback();
    walker.release();
    const s = snapshot.current;
    if (s) {
      walker.setPose(s.pos, s.yaw); // 空间位置回到进入回放前
      catalog.select(s.active);
      narration.restore(s.narration); // 现场讲解原样恢复
      snapshot.current = null;
    }
  };

  /* ---------- 真实参观统计：回放不计入 ---------- */

  const current = useRef({
    nearby: catalog.nearby,
    record: collection.record,
    playbackActive: film.playback.active,
  });
  current.current = {
    nearby: catalog.nearby,
    record: collection.record,
    playbackActive: film.playback.active,
  };
  useEffect(() => {
    const t = setInterval(() => {
      if (current.current.nearby && !current.current.playbackActive)
        current.current.record(current.current.nearby, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- 回放中的展示状态 ---------- */

  const segmentLabel = (() => {
    if (!frame) return "";
    if (frame.segment.kind === "transition") return "转场中";
    const clips = film.timeline.segments.filter((s) => s.kind === "clip");
    const i = clips.findIndex((s) => s === frame.segment);
    return `片段 ${i + 1} / ${clips.length}`;
  })();

  const filmAudio: AudioState = {
    artworkId: filmNarration?.id ?? null,
    elapsed: filmNarration?.offset ?? 0,
    playing: film.playback.playing && !!filmNarration,
    rate: 1,
  };

  return {
    catalog,
    tour: {
      ...tour,
      start: (id: string) => {
        if (!film.playback.active) tour.start(id);
      },
      resume: () => {
        if (!film.playback.active) tour.resume();
      },
    },
    collection,
    walker,
    narration,
    film,
    frame,
    filmAudio,
    filmCaption,
    segmentLabel,
    go,
    toggleFavorite,
    startRecording,
    stopRecording: film.stopRecording,
    enterPlayback,
    exitPlayback,
    pauseTour: () => {
      tour.pause();
      walker.stop();
      narration.pause();
    },
    stopTour: () => {
      tour.stop();
      walker.stop();
      narration.pause();
    },
    nextTour: () => {
      walker.stop();
      narration.pause();
      tour.next();
    },
  };
}

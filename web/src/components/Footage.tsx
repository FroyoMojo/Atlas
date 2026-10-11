// Harvey footage in a YouTube player that follows the replay: normal speed while the rivers are quiet,
// sped up (2x, YouTube's top rate) while any covered area is flooding. Reset on the map sends it back
// to the start (resetKey). The video is set with VITE_FOOTAGE_ID (a YouTube video id); without one the
// panel says so instead of showing a broken player. The frame is oversized (see styles.css) and stays
// hidden until the video is really playing, so YouTube's title bar and spinner are never visible.
import { useEffect, useRef, useState } from "react";
import { config } from "../config";

interface YTPlayer {
  setPlaybackRate(rate: number): void;
  mute(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<void> | null = null;
function loadYouTube(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiReady ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiReady;
}

export function Footage({ flooding, resetKey = 0 }: { flooding: boolean; resetKey?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const id = config.footageId;

  useEffect(() => {
    if (!id) return;
    let dead = false;
    loadYouTube().then(() => {
      if (dead || !host.current || !window.YT) return;
      const mount = document.createElement("div");
      host.current.replaceChildren(mount);
      player.current = new window.YT.Player(mount, {
        videoId: id,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: id, playsinline: 1, rel: 0, modestbranding: 1,
          disablekb: 1, fs: 0, iv_load_policy: 3, cc_load_policy: 0, start: config.footageStart, origin: window.location.origin,
        },
        events: {
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            // 1 = playing: wait for YouTube's title bar to fade before showing the frame.
            if (e.data === 1) setTimeout(() => !dead && setShown(true), 1800);
            // 0 = ended: loop from the start point rather than YouTube's end screen.
            if (e.data === 0) e.target.seekTo(config.footageStart, true);
          },
          onReady: (e: { target: YTPlayer }) => {
            e.target.mute();
            e.target.playVideo();
            setReady(true);
          },
        },
      });
    });
    return () => {
      dead = true;
      player.current?.destroy();
      player.current = null;
      setReady(false);
      setShown(false);
    };
  }, [id]);

  useEffect(() => {
    if (ready) player.current?.setPlaybackRate(flooding ? 2 : 1);
  }, [ready, flooding]);

  // Reset on the map: back to the start of the clip at normal speed.
  const firstKey = useRef(resetKey);
  useEffect(() => {
    if (!ready || resetKey === firstKey.current) return;
    player.current?.setPlaybackRate(1);
    player.current?.seekTo(config.footageStart, true);
    player.current?.playVideo();
  }, [ready, resetKey]);

  return (
    <div className="footage">
      {id ? <div ref={host} className={`footage-frame ${shown ? "on" : ""}`} /> : (
        <div className="footage-empty">Hurricane Harvey, Houston, 2017</div>
      )}
      <span className={`footage-tag ${flooding ? "hot" : ""}`}>
        <i className="dot" style={{ background: flooding ? "#D92D20" : "#98A2B3" }} />
        {flooding ? "Flooding · sped up" : "Hurricane Harvey · Houston, 2017"}
      </span>
    </div>
  );
}

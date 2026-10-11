// Harvey footage in a YouTube player that follows the replay: normal speed while the rivers are quiet,
// sped up (2x, YouTube's top rate) while any covered area is flooding. The video is set with
// VITE_FOOTAGE_ID (a YouTube video id); without one the panel says so instead of showing a broken player.
import { useEffect, useRef, useState } from "react";
import { config } from "../config";

interface YTPlayer {
  setPlaybackRate(rate: number): void;
  mute(): void;
  playVideo(): void;
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

export function Footage({ flooding }: { flooding: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
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
        playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: id, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, start: config.footageStart },
        events: {
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
    };
  }, [id]);

  useEffect(() => {
    if (ready) player.current?.setPlaybackRate(flooding ? 2 : 1);
  }, [ready, flooding]);

  return (
    <div className="footage">
      {id ? <div ref={host} className="footage-frame" /> : (
        <div className="footage-empty">Harvey footage goes here. Set VITE_FOOTAGE_ID to a YouTube video id.</div>
      )}
      <span className={`footage-tag ${flooding ? "hot" : ""}`}>
        <i className="dot" style={{ background: flooding ? "#D92D20" : "#98A2B3" }} />
        {flooding ? "Flooding · sped up" : "Hurricane Harvey · Houston, 2017"}
      </span>
    </div>
  );
}

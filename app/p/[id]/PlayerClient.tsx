"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Nunito } from "next/font/google";
import OilBackground from "@/components/OilBackground";

const nunito = Nunito({ subsets: ["latin"] });

const TITLE_LINE1 = "AI MUSIC";
const TITLE_LINE2 = "WORKSHOP";
// アニメーション遅延を行をまたいで連続させるためのオフセット
const LINE2_OFFSET = TITLE_LINE1.length + 1;
const BAR_COUNT = 80;

function formatTime(sec: number) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  audioUrl: string;
  displayName: string;
  fileKey: string;
}

export default function PlayerClient({ audioUrl, displayName, fileKey }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const idleTimeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Canvas waveform ──────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const barWidth = (W / BAR_COUNT) * 0.55;
    const step = W / BAR_COUNT;

    const analyser = analyserRef.current;

    if (analyser) {
      // リアルタイム波形
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < BAR_COUNT; i++) {
        const binIndex = Math.floor((i / BAR_COUNT) * bufferLength * 0.75);
        const value = dataArray[binIndex];
        const barH = Math.max(3, (value / 255) * H);
        const x = i * step + (step - barWidth) / 2;
        const y = H - barH;

        const gradient = ctx.createLinearGradient(0, H, 0, 0);
        gradient.addColorStop(0, "#F59E0B");
        gradient.addColorStop(1, "#FEF08A");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 3);
        ctx.fill();
      }
    } else {
      // 待機アニメーション（ゆらゆら）
      idleTimeRef.current += 1;
      const t = idleTimeRef.current;

      for (let i = 0; i < BAR_COUNT; i++) {
        const phase = (i / BAR_COUNT) * Math.PI * 6 + t * 0.025;
        const barH = (Math.sin(phase) * 0.5 + 0.5) * H * 0.28 + 3;
        const x = i * step + (step - barWidth) / 2;
        const y = H - barH;

        ctx.fillStyle = "rgba(251,191,36,0.3)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 3);
        ctx.fill();
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // ── Audio Context ────────────────────────────────────────────────────────

  function setupAudioContext() {
    if (audioCtxRef.current) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    const source = ctx.createMediaElementSource(audioRef.current!);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    // Web Audio API セットアップ（失敗しても再生は続行）
    try {
      setupAudioContext();
      await audioCtxRef.current?.resume();
    } catch (e) {
      console.warn("Web Audio API setup failed (waveform disabled):", e);
    }

    isPlaying ? audio.pause() : await audio.play();
  }

  // ── Seek ─────────────────────────────────────────────────────────────────

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  // ── Download ─────────────────────────────────────────────────────────────

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(fileKey)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = displayName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  const progress = duration ? currentTime / duration : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 gap-10">
      <OilBackground />

      {/* コンテンツ（背景の上） */}
      <div className="relative z-10 w-full flex flex-col items-center gap-10">

      {/* タイトル（バリアブルフォント アニメーション） */}
      <h1
        className={`${nunito.className} text-white text-5xl sm:text-6xl tracking-tight text-center flex flex-col items-center gap-1`}
      >
        {/* 1行目: AI MUSIC */}
        <span className="flex justify-center">
          {TITLE_LINE1.split("").map((char, i) => (
            <span
              key={i}
              className="inline-block"
              style={{
                animation: `title-bounce 2.4s ease-in-out infinite`,
                animationDelay: `${i * 0.09}s`,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </span>
        {/* 2行目: WORKSHOP */}
        <span className="flex justify-center">
          {TITLE_LINE2.split("").map((char, i) => (
            <span
              key={i}
              className="inline-block"
              style={{
                animation: `title-bounce 2.4s ease-in-out infinite`,
                animationDelay: `${(i + LINE2_OFFSET) * 0.09}s`,
              }}
            >
              {char}
            </span>
          ))}
        </span>
      </h1>

      {/* キャラクター */}
      <img
        src="/top-c.png"
        alt="character"
        className="w-36 sm:w-44 object-contain drop-shadow-2xl"
        style={{
          animation: "char-float 8s linear infinite",
          filter: "brightness(0.75) contrast(1.05) saturate(0.85)",
        }}
      />

      {/* キャッチコピー */}
      <p className={`${nunito.className} bg-white text-black text-sm font-semibold px-4 py-1.5 rounded-full tracking-wide`}>
        Your audio download page
      </p>

      {/* 波形キャンバス */}
      <canvas
        ref={canvasRef}
        className="w-full max-w-sm h-24"
        style={{ display: "block" }}
      />

      {/* オーディオ要素（非表示） */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* プレイヤーUI */}
      <div className="w-full max-w-sm space-y-5">

        {/* 再生ボタン + プログレスバー */}
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="shrink-0 w-14 h-14 rounded-full bg-yellow-400 hover:bg-yellow-300
              active:scale-95 flex items-center justify-center transition-all
              shadow-[0_0_24px_rgba(251,191,36,0.35)]"
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0a0a0a" className="w-6 h-6">
                <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0a0a0a" className="w-6 h-6 ml-0.5">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <div className="flex-1 space-y-2">
            {/* プログレスバー */}
            <div
              className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer group"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-yellow-400 rounded-full relative"
                style={{ width: `${progress * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3
                  bg-yellow-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* 時間表示 */}
            <div className="flex justify-between text-xs text-white/30 font-mono tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* 曲名 */}
        <p className={`${nunito.className} text-white font-semibold text-lg text-center truncate`}>
          {displayName}
        </p>

        {/* ダウンロード */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={`${nunito.className} w-full flex items-center justify-center gap-2
            py-3 rounded-xl border-2 border-yellow-400 text-yellow-400 font-semibold
            hover:bg-yellow-400 hover:text-[#0a0a0a] active:scale-95
            disabled:opacity-50 transition-all duration-200`}
        >
          {isDownloading ? (
            <>
              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              ダウンロード中…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              ダウンロード
            </>
          )}
        </button>
      </div>

      </div>{/* z-10 wrapper end */}
    </div>
  );
}

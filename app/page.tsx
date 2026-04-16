"use client";

import { Nunito } from "next/font/google";
import Image from "next/image";
import OilBackground from "@/components/OilBackground";

const nunito = Nunito({ subsets: ["latin"] });

const TITLE_LINE1 = "AI MUSIC";
const TITLE_LINE2 = "WORKSHOP";
const LINE2_OFFSET = TITLE_LINE1.length + 1;

export default function TopPage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4">
      {/* 油膜背景 */}
      <OilBackground />

      {/* コンテンツ */}
      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* タイトル */}
        <h1
          className={`${nunito.className} text-5xl sm:text-6xl font-black text-center leading-tight`}
        >
          <div>
            {TITLE_LINE1.split("").map((ch, i) => (
              <span
                key={i}
                className="inline-block text-white"
                style={{
                  animation: `title-bounce 2s ease-in-out ${i * 0.08}s infinite`,
                }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </div>
          <div>
            {TITLE_LINE2.split("").map((ch, i) => (
              <span
                key={i}
                className="inline-block text-white"
                style={{
                  animation: `title-bounce 2s ease-in-out ${(LINE2_OFFSET + i) * 0.08}s infinite`,
                }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </div>
        </h1>

        {/* キャラクター */}
        <Image
          src="/top-c.png"
          alt="character"
          width={220}
          height={220}
          className="object-contain drop-shadow-2xl"
          style={{
            animation: "char-float 12s linear infinite",
            filter: "brightness(0.75) contrast(1.05) saturate(0.85)",
          }}
          priority
        />
      </div>
    </main>
  );
}

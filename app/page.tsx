"use client";

import { Nunito } from "next/font/google";
import Image from "next/image";

const nunito = Nunito({ subsets: ["latin"] });

const TITLE_LINE1 = "AI MUSIC";
const TITLE_LINE2 = "WORKSHOP";
const LINE2_OFFSET = TITLE_LINE1.length + 1;

export default function TopPage() {
  return (
    <main
      className={`${nunito.className} min-h-screen bg-black flex flex-col items-center justify-center px-4`}
    >
      {/* タイトル */}
      <h1 className="text-5xl sm:text-6xl font-black text-center leading-tight mb-10">
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
        src="/kyara.png"
        alt="character"
        width={220}
        height={220}
        className="object-contain"
        priority
      />
    </main>
  );
}

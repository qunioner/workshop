import type { Metadata } from "next";
import { getMeta } from "@/lib/r2";
import PlayerClient from "./PlayerClient";

export const runtime = "edge";

type Props = {
  params: Promise<{ id: string }>;
};

function getDisplayName(key: string, meta: Record<string, { displayName: string }>) {
  return meta[key]?.displayName ?? key.replace(/^\d+_/, "").replace(/\.[^.]+$/, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const key = decodeURIComponent(id);
  const meta = await getMeta();
  const displayName = getDisplayName(key, meta);
  return {
    title: `${displayName} | AI Music Workshop`,
  };
}

export default async function PlayPage({ params }: Props) {
  const { id } = await params;
  const key = decodeURIComponent(id);
  const meta = await getMeta();
  const displayName = getDisplayName(key, meta);
  const audioUrl = `/api/stream?key=${encodeURIComponent(key)}`;

  return (
    <PlayerClient
      audioUrl={audioUrl}
      displayName={displayName}
      fileKey={key}
    />
  );
}

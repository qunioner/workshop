import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suno Workshop",
  description: "音源管理・共有システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

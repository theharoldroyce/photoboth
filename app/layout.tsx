import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Photobooth — Instant Memories",
  description: "A retro-styled photobooth app. Strike a pose!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

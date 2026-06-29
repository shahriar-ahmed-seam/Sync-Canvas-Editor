import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Sync-Canvas — real-time collaborative whiteboard",
  description:
    "A conflict-free, real-time collaborative whiteboard built on CRDTs. Create a room, share the link, draw together.",
  openGraph: {
    title: "Sync-Canvas — real-time collaborative whiteboard",
    description:
      "Conflict-free, real-time collaboration built on CRDTs. Create a room, share the link, draw together.",
    url: siteUrl,
    siteName: "Sync-Canvas",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Sync-Canvas" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sync-Canvas — real-time collaborative whiteboard",
    description:
      "Conflict-free, real-time collaboration built on CRDTs. Create a room, share the link, draw together.",
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

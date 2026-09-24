import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tally · agent studio with a playout log",
    template: "%s · Tally",
  },
  description:
    "Build AI agents from skills and live tools, run them on Claude or any OpenAI-compatible model with your own key, and watch every step in a broadcast-style playout log. Also a remote MCP server.",
  authors: [{ name: "Ariel Grela", url: "https://arielgrela.vercel.app" }],
  openGraph: {
    type: "website",
    siteName: "Tally",
    title: "Tally · agent runs, on air",
    description: "Compose agents from skills and live tools, run them with your own key and trace every step.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#090b0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display"
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "GetCRX — Chrome Extension Unpacker & Security Auditor",
  description:
    "Extract, inspect, and analyze the raw source code of any Chrome Web Store extension in real-time. Features live code viewer, manifest V3 migration check, secrets scanner, and security audit.",
  keywords: [
    "chrome extension unpacker",
    "crx extractor",
    "download crx",
    "chrome web store downloader",
    "manifest v3 analyzer",
    "extension security audit",
    "crx to zip",
    "extension source code viewer"
  ],
  authors: [{ name: "JOJIN JOHN", url: "https://getcrx.vercel.app" }],
  creator: "JOJIN JOHN",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg"
  },
  openGraph: {
    title: "GetCRX — Chrome Extension Unpacker & Security Auditor",
    description:
      "Instant in-browser Chrome extension source code extractor, secret detector, permission auditor, and Manifest V3 inspector.",
    url: "https://getcrx.vercel.app",
    siteName: "GetCRX",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "GetCRX — Chrome Extension Unpacker & Security Auditor",
    description:
      "Instant in-browser Chrome extension source code extractor, secret detector, permission auditor, and Manifest V3 inspector."
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-body bg-ink text-paper antialiased`}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "TekScribe: voice-to-summary for the trades",
  description:
    "Field-service techs record a voice note; TekScribe transcribes it, extracts parts and next steps, and writes the customer update.",
  appleWebApp: {
    capable: true,
    title: "TekScribe",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // Fill the screen edge to edge and let the app pad for the notch / home
  // indicator itself (see safe-area handling in globals.css). Locking zoom
  // stops iOS from bouncing the layout when an input is focused.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Pages cross-fade with a slight lift on navigation (see globals.css). */}
        <ViewTransition default="tt-page">{children}</ViewTransition>
      </body>
    </html>
  );
}

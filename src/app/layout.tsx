import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lumi Beauty",
    template: "%s | Lumi Beauty",
  },
  description: "美業店家營運、行事曆與顧客線上預約平台",
  applicationName: "Lumi Beauty",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink focus:shadow"
          href="#main-content"
        >
          跳到主要內容
        </a>
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";

import "./globals.css";
import {getLanguage} from "@/lib/i18n/server";
import {LanguageProvider} from "@/components/language-provider";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const {locale, preference, t} = await getLanguage();
  return (
    <html lang={locale}>
      <body>
        <LanguageProvider locale={locale} preference={preference}>
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-ink focus:shadow"
          href="#main-content"
        >
          {t('跳到主要內容')}
        </a>
        {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

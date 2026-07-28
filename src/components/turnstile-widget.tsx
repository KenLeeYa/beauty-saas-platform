"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(
        element: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          theme: "light";
          size: "flexible";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ): string;
      remove(widgetId: string): void;
    };
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(root);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    let disposed = false;

    function renderWidget(): void {
      if (
        disposed ||
        !containerRef.current ||
        !window.turnstile ||
        widgetIdRef.current
      ) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(
        containerRef.current,
        {
          sitekey: siteKey,
          action: "booking_session",
          theme: "light",
          size: "flexible",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        },
      );
    }

    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        renderWidget();
      } else {
        existing.addEventListener("load", renderWidget, { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderWidget, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onToken, shouldLoad, siteKey]);

  return (
    <div ref={rootRef} className="min-h-24">
      <div ref={containerRef} />
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-teal" />
        完成安全驗證後即可查詢即時時段。
      </p>
    </div>
  );
}

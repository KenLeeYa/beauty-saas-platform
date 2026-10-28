"use client";

import { LoaderCircle, LogOut, RotateCcw, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {LanguageSwitcher, useLanguage} from "./language-provider";

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export function LogoutButton({showLanguage = true, disabled = false}: {showLanguage?: boolean; disabled?: boolean}) {
  const {t} = useLanguage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function logout(): Promise<void> {
    if (lock.current || disabled) return;
    lock.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken(),
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("logout");
      setFailed(false);
      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">{showLanguage && <LanguageSwitcher />}
      <Popover.Root open={failed} onOpenChange={setFailed}>
      <Popover.Anchor asChild><button
      ref={buttonRef}
      aria-label={pending ? t("登出中") : t("登出")}
      className="utility-icon hover:text-coral disabled:cursor-wait disabled:opacity-60"
      disabled={pending || disabled}
      title={t("登出")}
      type="button"
      onClick={() => void logout()}
    >
      {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
      <span className="sr-only">{pending ? t("登出中") : t("登出")}</span>
    </button></Popover.Anchor>
    <Popover.Portal><Popover.Content sideOffset={8} collisionPadding={12} align="end" aria-label={t("登出")}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (document.activeElement === document.body) buttonRef.current?.focus();
      }}
      className="z-[90] w-72 max-w-[calc(100vw-24px)] rounded-md border border-slate-200 bg-white p-3 text-sm text-ink shadow-lg">
      <p role="alert" className="pr-9 leading-relaxed">{t("登出尚未完成，請檢查連線後重試。")}</p>
      <Popover.Close asChild><button type="button" className="utility-icon absolute right-1 top-1" aria-label={t("關閉")} title={t("關閉")}>
        <X size={16} aria-hidden="true"/>
      </button></Popover.Close>
      <button type="button" disabled={pending} onClick={()=>void logout()}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3 disabled:opacity-60">
        <RotateCcw size={16} aria-hidden="true"/>{t("重試")}
      </button>
    </Popover.Content></Popover.Portal>
    </Popover.Root></div>
  );
}

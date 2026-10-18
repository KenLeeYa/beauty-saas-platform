"use client";

import { CalendarDays, LogOut, Store, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppRole } from "../lib/demo-auth";

export function AppHeader({
  role,
  displayName
}: {
  role: AppRole;
  displayName: string;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const RoleIcon = role === "merchant" ? Store : UserRound;

  async function logout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">L</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">Lumi Workspace</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              {role === "merchant" ? <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" /> : <RoleIcon aria-hidden="true" className="h-3.5 w-3.5" />}
              {role === "merchant" ? "店家營運後台" : "顧客線上預約"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-ink">{displayName}</p>
            <p className="text-xs text-slate-500">{role === "merchant" ? "店家帳號" : "顧客帳號"}</p>
          </div>
          <button
            aria-label="登出"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-ink disabled:opacity-50"
            disabled={isLoggingOut}
            title="登出"
            type="button"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

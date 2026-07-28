"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout(): Promise<void> {
    setPending(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken(),
        },
      });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <button
      aria-label="登出"
      className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-coral hover:text-coral disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      title="登出"
      type="button"
      onClick={() => void logout()}
    >
      <LogOut aria-hidden="true" className="h-4 w-4" />
      <span>{pending ? "登出中" : "登出"}</span>
    </button>
  );
}

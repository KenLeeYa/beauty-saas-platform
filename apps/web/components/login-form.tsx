"use client";

import { Eye, EyeOff, LogIn, Store, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DemoCredential = {
  email: string;
  password: string;
};

type LoginResponse = {
  redirectTo?: string;
  error?: string;
};

export function LoginForm({
  merchantCredential,
  customerCredential
}: {
  merchantCredential: DemoCredential;
  customerCredential: DemoCredential;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(merchantCredential.email);
  const [password, setPassword] = useState(merchantCredential.password);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillCredential(credential: DemoCredential) {
    setEmail(credential.email);
    setPassword(credential.password);
    setError(null);
  }

  async function submitLogin() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json()) as LoginResponse;

      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.error ?? "登入失敗，請稍後再試。");
      }

      router.replace(payload.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登入失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">L</span>
          <div>
            <p className="text-sm font-semibold text-ink">Lumi Workspace</p>
            <p className="text-xs text-slate-500">Beauty business platform</p>
          </div>
        </div>
        <h1 className="mt-8 text-3xl font-semibold text-ink sm:text-4xl">登入預約空間</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">系統會依照帳號角色，自動進入店家後台或顧客預約頁。</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
          type="button"
          onClick={() => fillCredential(merchantCredential)}
        >
          <Store aria-hidden="true" className="h-5 w-5 shrink-0 text-teal" />
          <span>
            <span className="block text-sm font-semibold text-ink">店家測試</span>
            <span className="mt-1 block text-xs text-slate-500">進入營運後台</span>
          </span>
        </button>
        <button
          className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          type="button"
          onClick={() => fillCredential(customerCredential)}
        >
          <UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-coral" />
          <span>
            <span className="block text-sm font-semibold text-ink">顧客測試</span>
            <span className="mt-1 block text-xs text-slate-500">進入線上預約</span>
          </span>
        </button>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitLogin();
        }}
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            autoComplete="username"
            className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/10"
            inputMode="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">密碼</span>
          <span className="relative mt-2 block">
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 pr-12 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/10"
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
              className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink"
              title={showPassword ? "隱藏密碼" : "顯示密碼"}
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
            </button>
          </span>
        </label>

        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          <LogIn aria-hidden="true" className="h-4 w-4" />
          {isSubmitting ? "登入中" : "登入"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>其他登入方式</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        aria-describedby="google-login-status"
        className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400"
        disabled
        type="button"
      >
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-bold text-slate-500">
          G
        </span>
        使用 Google 繼續
      </button>
      <p id="google-login-status" className="mt-2 text-center text-xs text-slate-400">
        Google OAuth 將於正式環境設定後啟用
      </p>
    </div>
  );
}


"use client";

import {
  ClipboardList,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

type LoginPayload = {
  data?: {
    redirectTo?: string;
  };
  error?: {
    message?: string;
  };
};

const testAccounts = {
  merchant: {
    email: "merchant@lumi.test",
    password: "Beauty123!",
  },
  customer: {
    email: "customer@lumi.test",
    password: "Beauty123!",
  },
  applicant: {
    email: "applicant@beauty.test",
    password: "Beauty123!",
  },
} as const;

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function LoginForm({
  googleEnabled,
  initialError,
  localAuthEnabled,
  nextPath,
}: {
  googleEnabled: boolean;
  initialError?: string;
  localAuthEnabled: boolean;
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState<string>(
    localAuthEnabled ? testAccounts.merchant.email : "",
  );
  const [password, setPassword] = useState<string>(
    localAuthEnabled ? testAccounts.merchant.password : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function submitLogin(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const loginPath = nextPath
        ? `/api/auth/login?next=${encodeURIComponent(nextPath)}`
        : "/api/auth/login";
      const response = await fetch(loginPath, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as LoginPayload;
      const redirectTo = payload.data?.redirectTo;

      if (!response.ok || !redirectTo) {
        throw new Error(payload.error?.message ?? "登入失敗，請稍後再試。");
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "登入失敗，請稍後再試。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">
          L
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Lumi Workspace</p>
          <p className="text-xs text-slate-500">Beauty operations</p>
        </div>
      </div>

      <h1 className="mt-8 text-3xl font-semibold text-ink sm:text-4xl">
        登入預約空間
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        依照組織與分店權限，自動進入店家後台、服務人員班表或顧客預約頁。
      </p>

      {localAuthEnabled ? (
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <button
            className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 disabled:cursor-wait disabled:opacity-60"
            disabled={!isHydrated}
            type="button"
            onClick={() => {
              setEmail(testAccounts.merchant.email);
              setPassword(testAccounts.merchant.password);
            }}
          >
            <Store aria-hidden="true" className="h-5 w-5 shrink-0 text-teal" />
            <span>
              <span className="block text-sm font-semibold text-ink">
                店家測試
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                營運後台
              </span>
            </span>
          </button>
          <button
            className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 disabled:cursor-wait disabled:opacity-60"
            disabled={!isHydrated}
            type="button"
            onClick={() => {
              setEmail(testAccounts.customer.email);
              setPassword(testAccounts.customer.password);
            }}
          >
            <UserRound
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-coral"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                顧客測試
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                線上預約
              </span>
            </span>
          </button>
          <button
            className="flex min-h-20 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:cursor-wait disabled:opacity-60"
            disabled={!isHydrated}
            type="button"
            onClick={() => {
              setEmail(testAccounts.applicant.email);
              setPassword(testAccounts.applicant.password);
            }}
          >
            <ClipboardList
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-gold"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                申請測試
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                商家導入
              </span>
            </span>
          </button>
        </div>
      ) : null}

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
              disabled={!isHydrated}
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
                disabled={!isHydrated}
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
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <Eye aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </span>
          </label>

          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            disabled={!isHydrated || isSubmitting}
            type="submit"
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            {!isHydrated ? "準備中" : isSubmitting ? "登入中" : "登入"}
          </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>或</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <a
        aria-disabled={!googleEnabled}
        className={`flex h-12 w-full items-center justify-center gap-3 rounded-md border text-sm font-semibold ${
          googleEnabled
            ? "border-slate-300 bg-white text-ink hover:border-teal"
            : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
        }`}
        href={
          googleEnabled
            ? nextPath
              ? `/auth/google?next=${encodeURIComponent(nextPath)}`
              : "/auth/google"
            : "#"
        }
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-bold text-slate-600"
        >
          G
        </span>
        使用 Google 繼續
      </a>

      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-teal" />
        角色與分店權限由伺服器重新驗證
      </p>
      <p className="mt-5 text-center text-sm text-slate-600">
        想使用店家後台？{" "}
        <Link
          className="font-semibold text-teal hover:underline"
          href="/onboarding"
        >
          申請商家空間
        </Link>
      </p>
    </div>
  );
}

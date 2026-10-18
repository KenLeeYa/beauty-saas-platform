"use client";

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Save,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatLocalDateTime } from "@/lib/presentation/date-time";
import type { ApplicantOnboardingData } from "@/server/onboarding/data";

import { LogoutButton } from "./logout-button";

type ApiPayload = {
  data?: {
    id: string;
    status: string;
    version: number;
  };
  error?: {
    message?: string;
  };
};

const statusLabels: Readonly<Record<string, string>> = {
  DRAFT: "草稿",
  SUBMITTED: "已送出",
  PENDING_REVIEW: "審核中",
  NEEDS_INFO: "待補件",
  APPROVED: "已核准",
  REJECTED: "未通過",
  WITHDRAWN: "已撤回",
  EXPIRED: "已逾期",
};

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export function MerchantApplicationForm({
  data,
}: {
  data: ApplicantOnboardingData;
}) {
  const router = useRouter();
  const application = data.application;
  const canCreateAnother = Boolean(
    application &&
      ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(application.status),
  );
  const editable =
    !application ||
    canCreateAnother ||
    ["DRAFT", "NEEDS_INFO"].includes(application.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: canCreateAnother ? "" : application?.businessName ?? "",
    contactName:
      canCreateAnother
        ? data.session.displayName
        : application?.contactName ?? data.session.displayName,
    contactEmail:
      canCreateAnother
        ? data.session.email
        : application?.contactEmail ?? data.session.email,
    contactPhone: canCreateAnother
      ? ""
      : application?.contactPhone ?? "",
    industryType: canCreateAnother
      ? "BEAUTY"
      : application?.industryType ?? "BEAUTY",
    desiredSlug: canCreateAnother
      ? ""
      : application?.desiredSlug ?? "",
    initialLocationName: canCreateAnother
      ? ""
      : application?.initialLocationName ?? "",
    initialLocationAddress: canCreateAnother
      ? ""
      : application?.initialLocationAddress ?? "",
    applicantNote: canCreateAnother
      ? ""
      : application?.applicantNote ?? "",
  });

  async function submit(shouldSubmit: boolean): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/onboarding/application", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({
          ...form,
          ...(application && !canCreateAnother
            ? { expectedVersion: application.version }
            : {}),
          submit: shouldSubmit,
        }),
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "商家申請儲存失敗。",
        );
      }

      setFeedback(shouldSubmit ? "申請已送出審核。" : "草稿已儲存。");
      router.replace(
        shouldSubmit ? "/onboarding/status" : "/onboarding/edit",
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "商家申請儲存失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const latestReason = application?.events.find(
    (event) => event.reason,
  )?.reason;

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">商家導入</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              申請 Beauty SaaS 商家空間
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-ink"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          返回入口
        </Link>

        {application ? (
          <section className="mt-6 border-y border-slate-200 bg-white px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">目前狀態</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {statusLabels[application.status] ??
                    application.status}
                </p>
              </div>
              <span className="rounded bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal">
                版本 {application.version}
              </span>
            </div>
            {latestReason &&
            ["NEEDS_INFO", "REJECTED"].includes(application.status) ? (
              <p
                className="mt-4 border-l-4 border-coral bg-coral/5 px-4 py-3 text-sm text-slate-700"
                role="status"
              >
                平台回覆：{latestReason}
              </p>
            ) : null}
          </section>
        ) : null}

        {application?.status === "APPROVED" &&
        application.approvedOrganization ? (
          <section className="mt-6 border-y border-slate-200 bg-white px-5 py-8 text-center">
            <CheckCircle2
              aria-hidden="true"
              className="mx-auto h-9 w-9 text-teal"
            />
            <h2 className="mt-4 text-xl font-semibold text-ink">
              商家空間已建立
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              公開預約仍維持關閉，請先完成開店設定與測試預約。
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white"
              href={`/merchant/setup?organization=${encodeURIComponent(
                application.approvedOrganization.slug,
              )}&location=main`}
            >
              <Building2 aria-hidden="true" className="h-4 w-4" />
              進入開店設定
            </Link>
          </section>
        ) : editable ? (
          <form
            className="mt-6 space-y-7"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(true);
            }}
          >
            <section className="border-y border-slate-200 bg-white px-5 py-6">
              <h2 className="text-lg font-semibold text-ink">
                商家與聯絡資料
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    商家名稱
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    required
                    value={form.businessName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        businessName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    聯絡人
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    required
                    value={form.contactName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contactName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    產業類型
                  </span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    value={form.industryType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        industryType: event.target.value,
                      }))
                    }
                  >
                    <option value="BEAUTY">美容美體</option>
                    <option value="SPA">SPA</option>
                    <option value="MASSAGE">按摩舒壓</option>
                    <option value="NAIL">美甲</option>
                    <option value="EYELASH">美睫</option>
                    <option value="HAIR">美髮</option>
                    <option value="OTHER">其他</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Email
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    required
                    type="email"
                    value={form.contactEmail}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contactEmail: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    聯絡電話
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    inputMode="tel"
                    required
                    value={form.contactPhone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contactPhone: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    商家網址代碼
                  </span>
                  <div className="mt-2 flex overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-teal">
                    <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-500">
                      /book/
                    </span>
                    <input
                      className="h-11 min-w-0 flex-1 px-3 outline-none"
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      required
                      value={form.desiredSlug}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          desiredSlug: event.target.value
                            .toLowerCase()
                            .replace(/\s+/g, "-")
                            .replace(/[^a-z0-9-]/g, ""),
                        }))
                      }
                    />
                  </div>
                </label>
              </div>
            </section>

            <section className="border-y border-slate-200 bg-white px-5 py-6">
              <h2 className="text-lg font-semibold text-ink">第一間分店</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    分店名稱
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    required
                    value={form.initialLocationName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        initialLocationName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    分店地址
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    required
                    value={form.initialLocationAddress}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        initialLocationAddress: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    申請備註
                  </span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-teal"
                    maxLength={1000}
                    value={form.applicantNote}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        applicantNote: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            <div aria-live="polite">
              {feedback ? (
                <p className="text-sm font-medium text-teal">{feedback}</p>
              ) : null}
              {error ? (
                <p
                  className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-ink"
                disabled={isSubmitting}
                type="button"
                onClick={() => void submit(false)}
              >
                <Save aria-hidden="true" className="h-4 w-4" />
                儲存草稿
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={isSubmitting}
                type="submit"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {isSubmitting ? "處理中" : "送出申請"}
              </button>
            </div>
          </form>
        ) : (
          <section className="mt-6 border-y border-slate-200 bg-white px-5 py-8 text-center">
            <Clock3
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-gold"
            />
            <h2 className="mt-4 text-xl font-semibold text-ink">
              平台正在處理申請
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              狀態更新會顯示在此頁，補件時才會重新開放編輯。
            </p>
          </section>
        )}

        {application?.events.length ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink">申請紀錄</h2>
            <ol className="mt-3 divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {application.events.map((event) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm"
                  key={event.id}
                >
                  <span className="font-medium text-ink">
                    {statusLabels[event.newStatus] ?? event.newStatus}
                  </span>
                  <time className="text-xs text-slate-500">
                    {formatLocalDateTime(event.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  );
}

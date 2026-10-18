"use client";

import {
  Check,
  CircleHelp,
  SearchCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatLocalDateTime } from "@/lib/presentation/date-time";
import type { AdminMerchantApplicationData } from "@/server/onboarding/data";

type ReviewAction =
  | "START_REVIEW"
  | "REQUEST_INFO"
  | "APPROVE"
  | "REJECT";

type ApiPayload = {
  data?: {
    id: string;
    status: string;
  };
  error?: {
    message?: string;
  };
};

const statusLabels: Readonly<Record<string, string>> = {
  DRAFT: "草稿",
  SUBMITTED: "待受理",
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

export function MerchantApplicationReview({
  data,
}: {
  data: AdminMerchantApplicationData;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(
    application: AdminMerchantApplicationData["applications"][number],
    action: ReviewAction,
  ): Promise<void> {
    let reason: string | undefined;
    if (action === "REQUEST_INFO" || action === "REJECT") {
      reason =
        window
          .prompt(
            action === "REQUEST_INFO"
              ? "請輸入需要補充的資料："
              : "請輸入未通過原因：",
          )
          ?.trim() || undefined;
      if (!reason) {
        return;
      }
    }
    if (
      action === "APPROVE" &&
      !window.confirm(
        `核准「${application.businessName}」並建立試用商家空間？公開預約仍會維持關閉。`,
      )
    ) {
      return;
    }

    setPendingId(application.id);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/merchant-applications/${application.id}/review`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({
            action,
            expectedVersion: application.version,
            ...(reason ? { reason } : {}),
          }),
        },
      );
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "商家申請審核失敗。",
        );
      }
      setFeedback("申請狀態已更新。");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "商家申請審核失敗。",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <div aria-live="polite" className="mb-4">
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

      <div className="space-y-4">
        {data.applications.map((application) => (
          <article
            className="rounded-md border border-slate-200 bg-white p-5"
            key={application.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {application.businessName}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {application.applicant.displayName} ·{" "}
                  {application.applicant.email}
                </p>
              </div>
              <span className="rounded bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {statusLabels[application.status] ??
                  application.status}
              </span>
            </div>

            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">網址代碼</dt>
                <dd className="mt-1 font-medium text-ink">
                  {application.desiredSlug}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">第一間分店</dt>
                <dd className="mt-1 font-medium text-ink">
                  {application.initialLocationName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">聯絡電話</dt>
                <dd className="mt-1 font-medium text-ink">
                  {application.contactPhone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">送出時間</dt>
                <dd className="mt-1 font-medium text-ink">
                  {application.submittedAt
                    ? formatLocalDateTime(application.submittedAt)
                    : "尚未送出"}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              {application.initialLocationAddress}
            </p>
            {application.applicantNote ? (
              <p className="mt-3 border-l-4 border-slate-200 px-3 text-sm leading-6 text-slate-600">
                {application.applicantNote}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {application.status === "SUBMITTED" ? (
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={pendingId === application.id}
                  type="button"
                  onClick={() =>
                    void review(application, "START_REVIEW")
                  }
                >
                  <SearchCheck aria-hidden="true" className="h-4 w-4" />
                  開始審核
                </button>
              ) : null}
              {application.status === "PENDING_REVIEW" ? (
                <>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-ink disabled:opacity-50"
                    disabled={pendingId === application.id}
                    type="button"
                    onClick={() =>
                      void review(application, "REQUEST_INFO")
                    }
                  >
                    <CircleHelp
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                    要求補件
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-50"
                    disabled={pendingId === application.id}
                    type="button"
                    onClick={() => void review(application, "REJECT")}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    不通過
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={pendingId === application.id}
                    type="button"
                    onClick={() => void review(application, "APPROVE")}
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    核准並建立試用
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {data.applications.length === 0 ? (
          <p className="border-y border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
            目前沒有商家申請。
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  ReceiptText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { formatLocalDate } from "@/lib/presentation/date-time";
import type { AdminBillingData } from "@/server/admin/billing";

type ApiPayload = {
  data?: {
    success: boolean;
    id: string;
  };
  error?: {
    message?: string;
  };
};

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function formatMoney(amountMinor: number, currency = "TWD"): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function PlatformBilling({ data }: { data: AdminBillingData }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(body: Readonly<Record<string, unknown>>) {
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data?.success) {
        throw new Error(payload.error?.message ?? "帳務操作失敗。");
      }
      setFeedback("帳務資料已更新。");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "帳務操作失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function issueInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = new Date(String(form.get("dueAt")));
    dueAt.setHours(23, 59, 59, 0);
    void mutate({
      action: "ISSUE_INVOICE",
      organizationId: String(form.get("organizationId")),
      periodStart: String(form.get("periodStart")),
      periodEnd: String(form.get("periodEnd")),
      dueAt: dueAt.toISOString(),
      description: String(form.get("description")),
      subtotalMinor: Number(form.get("subtotal")) * 100,
      taxMinor: Number(form.get("tax")) * 100,
    });
  }

  async function confirmPayment(
    invoice: AdminBillingData["invoices"][number],
  ) {
    const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
    const amount = window.prompt(
      "請輸入本次確認金額（元）：",
      String(outstanding / 100),
    );
    const reference = window.prompt("請輸入匯款或收款參考碼：");
    if (!amount || !reference?.trim()) {
      return;
    }
    await mutate({
      action: "CONFIRM_PAYMENT",
      invoiceId: invoice.id,
      amountMinor: Math.round(Number(amount) * 100),
      reference: reference.trim(),
    });
  }

  async function changeSubscription(
    organization: AdminBillingData["organizations"][number],
    action: "SUSPEND" | "REACTIVATE",
  ) {
    const reason = window
      .prompt(action === "SUSPEND" ? "請輸入暫停原因：" : "請輸入恢復原因：")
      ?.trim();
    if (!reason) {
      return;
    }
    if (
      action === "SUSPEND" &&
      !window.confirm(
        "暫停後會立即關閉此商家的公開預約，確定繼續嗎？",
      )
    ) {
      return;
    }
    await mutate({
      action,
      organizationId: organization.id,
      reason,
    });
  }

  return (
    <div className="space-y-8">
      <form
        className="border-y border-slate-200 bg-white px-5 py-6"
        onSubmit={issueInvoice}
      >
        <h2 className="text-lg font-semibold text-ink">開立人工帳單</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">商家</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
              name="organizationId"
              required
            >
              <option value="">選擇商家</option>
              {data.organizations
                .filter((organization) => organization.subscriptionId)
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name} ·{" "}
                    {organization.planName ?? "未設定方案"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              期間開始
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              name="periodStart"
              required
              type="date"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              期間結束
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              name="periodEnd"
              required
              type="date"
            />
          </label>
          <label className="lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              項目說明
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              defaultValue="Beauty SaaS 月租方案"
              name="description"
              required
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              未稅金額（元）
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              min="1"
              name="subtotal"
              required
              type="number"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              稅額（元）
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              defaultValue="0"
              min="0"
              name="tax"
              required
              type="number"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              繳款期限
            </span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              name="dueAt"
              required
              type="date"
            />
          </label>
        </div>
        <button
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          <ReceiptText aria-hidden="true" className="h-4 w-4" />
          開立帳單
        </button>
      </form>

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

      <section>
        <h2 className="text-lg font-semibold text-ink">訂閱狀態</h2>
        <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">商家</th>
                <th className="px-4 py-3 font-semibold">方案</th>
                <th className="px-4 py-3 font-semibold">狀態</th>
                <th className="px-4 py-3 font-semibold">本期截止</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.organizations.map((organization) => (
                <tr key={organization.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {organization.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {organization.planName ?? "未設定"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {organization.subscriptionStatus ?? "無訂閱"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {organization.periodEnd
                      ? formatLocalDate(organization.periodEnd)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {organization.subscriptionStatus === "SUSPENDED" ? (
                      <button
                        className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-teal disabled:opacity-50"
                        disabled={isSubmitting}
                        type="button"
                        onClick={() =>
                          void changeSubscription(
                            organization,
                            "REACTIVATE",
                          )
                        }
                      >
                        <PlayCircle
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                        恢復
                      </button>
                    ) : organization.subscriptionId ? (
                      <button
                        className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        type="button"
                        onClick={() =>
                          void changeSubscription(
                            organization,
                            "SUSPEND",
                          )
                        }
                      >
                        <PauseCircle
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                        暫停
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">最近帳單</h2>
        <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">帳單</th>
                <th className="px-4 py-3 font-semibold">商家</th>
                <th className="px-4 py-3 font-semibold">狀態</th>
                <th className="px-4 py-3 font-semibold">總額</th>
                <th className="px-4 py-3 font-semibold">已付</th>
                <th className="px-4 py-3 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {invoice.number}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invoice.organizationName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invoice.status}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatMoney(invoice.totalMinor, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatMoney(
                      invoice.amountPaidMinor,
                      invoice.currency,
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {["ISSUED", "OVERDUE"].includes(invoice.status) ? (
                      <button
                        className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-teal disabled:opacity-50"
                        disabled={isSubmitting}
                        type="button"
                        onClick={() => void confirmPayment(invoice)}
                      >
                        <CheckCircle2
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                        確認收款
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.invoices.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              目前沒有帳單。
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

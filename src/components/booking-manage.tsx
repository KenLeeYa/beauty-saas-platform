"use client";

import { LanguageSwitcher, useLanguage } from "@/components/language-provider";

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { formatLocalDateTime } from "@/lib/presentation/date-time";
import type { PublicBookingSummary } from "@/server/public-booking/booking";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

const statusLabels: Readonly<Record<string, string>> = {
  PENDING_PAYMENT: "待支付訂金",
  CONFIRMED: "預約已確認",
  CHECKED_IN: "已報到",
  IN_SERVICE: "服務進行中",
  COMPLETED: "服務已完成",
  NO_SHOW: "未到店",
  CANCELLED: "已取消",
  EXPIRED: "已失效",
  RESCHEDULED: "已改期",
};

function formatMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function BookingManage({
  authenticated,
  initialSummary,
}: {
  authenticated: boolean;
  initialSummary: PublicBookingSummary;
}) {
  const { locale, t, errorText } = useLanguage();
  const [summary, setSummary] = useState(initialSummary);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { booking } = summary;
  const dateTime = formatLocalDateTime(
    booking.service.startsAt,
    booking.location.timezone,
  );

  async function cancelBooking(): Promise<void> {
    if (
      !window.confirm(
        t("確定要取消這筆預約嗎？系統將依預約當時的規則計算可能產生的取消費。"),
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/public/bookings/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          trackingToken: summary.trackingToken,
          reason: "顧客透過安全連結取消",
        }),
      });
      const payload =
        (await response.json()) as ApiEnvelope<PublicBookingSummary>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? t("取消預約失敗。"));
      }
      setSummary(payload.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "取消預約失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const publicBookingPath = `/book/${booking.location.organizationSlug}/${booking.location.locationSlug}`;
  const reschedulePath = `${publicBookingPath}?reschedule=${encodeURIComponent(
    summary.trackingToken,
  )}`;

  return (
    <div className="booking-surface min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <p className="font-semibold text-ink">{t("預約狀態")}</p>
          <div className="flex items-center gap-3">
            <Link
              className="text-sm font-medium text-teal hover:underline"
              href={publicBookingPath}
            >
              {t("返回預約頁")}</Link>
            {authenticated ? <LogoutButton /> : <LanguageSwitcher />}
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <section className="border-b border-slate-200 pb-8">
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${
                booking.status === "CANCELLED"
                  ? "bg-red-100 text-red-700"
                  : "bg-teal/10 text-teal"
              }`}
            >
              {booking.status === "CANCELLED" ? (
                <XCircle aria-hidden="true" className="h-6 w-6" />
              ) : (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-6 w-6"
                />
              )}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-500">
                {booking.customerName}{t("，您好")}</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
                {t(statusLabels[booking.status] ?? booking.status)}
              </h1>
              {booking.contactHint ? (
                <p className="mt-2 text-sm text-slate-500">
                  {t("通知聯絡：")}{booking.contactHint.replace(/^手機末四碼/, t("手機末四碼"))}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-labelledby="booking-details-heading">
            <h2
              id="booking-details-heading"
              className="text-lg font-semibold text-ink"
            >
              {t("預約內容")}</h2>
            <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 bg-white px-4">
              <div className="flex gap-3 py-4">
                <CalendarClock
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-teal"
                />
                <div>
                  <dt className="text-xs text-slate-500">{t("日期時間")}</dt>
                  <dd className="mt-1 font-medium text-ink">{dateTime}</dd>
                </div>
              </div>
              <div className="flex gap-3 py-4">
                <Clock3
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-coral"
                />
                <div>
                  <dt className="text-xs text-slate-500">{t("服務")}</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {booking.service.name} ·{" "}
                    {booking.service.variantName}
                  </dd>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("服務人員：")}{booking.service.staffName ?? t("由店家安排")}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 py-4">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-gold"
                />
                <div>
                  <dt className="text-xs text-slate-500">{t("分店")}</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {booking.location.name}
                  </dd>
                  <p className="mt-1 text-sm text-slate-500">
                    {booking.location.address}
                  </p>
                </div>
              </div>
            </dl>

            {booking.status === "PENDING_PAYMENT" ? (
              <div className="mt-6 border-l-4 border-coral bg-white px-4 py-4">
                <p className="font-semibold text-ink">{t("等待店家確認訂金")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("本次需支付訂金")}{" "}
                  {formatMoney(
                    booking.depositRequiredMinor,
                    booking.currency,
                    locale,
                  )}
                  {t("。店家確認後，狀態會更新為預約已確認。")}</p>
              </div>
            ) : null}

            {booking.cancellationFeeMinor > 0 ? (
              <p className="mt-5 text-sm text-coral">
                {t("依預約規則計算的取消費為")}{" "}
                {formatMoney(
                  booking.cancellationFeeMinor,
                  booking.currency,
                  locale,
                )}
                。
              </p>
            ) : null}
          </section>

          <aside>
            <div className="border-t-4 border-ink bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{t("預約總額")}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatMoney(booking.totalMinor, booking.currency, locale)}
              </p>
              <div className="mt-5 space-y-3">
                {booking.customerActions.rescheduleEnabled ? (
                  <Link
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white text-sm font-semibold text-ink hover:border-teal hover:text-teal"
                    href={reschedulePath}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                    {t("改期")}</Link>
                ) : null}
                {booking.customerActions.cancellationEnabled ? (
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() => void cancelBooking()}
                  >
                    <XCircle
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                    {isSubmitting ? t("處理中...") : t("取消預約")}
                  </button>
                ) : null}
                <a
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink text-sm font-semibold text-white hover:bg-slate-800"
                  href={`tel:${booking.location.phone}`}
                >
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {t("聯繫店家")}</a>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-teal"
              />
              {t("此連結可管理您的預約，請勿轉傳給他人。")}</p>
          </aside>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorText(error)}
          </p>
        ) : null}
      </main>
    </div>
  );
}

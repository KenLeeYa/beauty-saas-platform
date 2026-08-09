"use client";

import {
  Bell,
  CircleAlert,
  Clock3,
  RefreshCw,
  Send,
} from "lucide-react";

import { formatLocalMonthDayTime } from "@/lib/presentation/date-time";
import type { MerchantWorkspaceData } from "@/server/merchant/data";

const eventLabels: Readonly<Record<string, string>> = {
  BOOKING_CONFIRMED: "預約已確認",
  BOOKING_RESCHEDULED: "預約已改期",
  BOOKING_CANCELLED: "預約已取消",
  BOOKING_REMINDER_24H: "預約前一天提醒",
  BOOKING_REMINDER_3H: "預約前三小時提醒",
  BOOKING_REMINDER_1H: "預約前一小時提醒",
  BOOKING_PAYMENT_PENDING: "待確認訂金",
  BOOKING_PAYMENT_CONFIRMED: "訂金已確認",
  BOOKING_COMPLETED: "服務完成",
  REVIEW_REQUEST: "回饋邀請",
  REVISIT_REMINDER: "回訪提醒",
  NO_SHOW_NOTICE: "未到店通知",
};

const deliveryLabels: Readonly<Record<string, string>> = {
  PENDING: "等待中",
  SENT: "已送出",
  FAILED: "傳送失敗",
  SKIPPED: "已略過",
  DISABLED: "未啟用",
};

const deliveryClasses: Readonly<Record<string, string>> = {
  PENDING: "bg-amber-100 text-amber-800",
  SENT: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-600",
  DISABLED: "bg-slate-100 text-slate-600",
};

type Integration = MerchantWorkspaceData["notificationIntegrations"][number];
type Delivery = MerchantWorkspaceData["notificationDeliveries"][number];

function formatDeliveryTime(value: string, timezone: string): string {
  return formatLocalMonthDayTime(value, timezone);
}

function DeliveryStatus({ delivery }: { delivery: Delivery }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        deliveryClasses[delivery.status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {deliveryLabels[delivery.status] ?? delivery.status}
    </span>
  );
}

function RetryButton({
  delivery,
  busy,
  onRetry,
}: {
  delivery: Delivery;
  busy: boolean;
  onRetry: (deliveryId: string) => Promise<void>;
}) {
  const retryable = ["FAILED", "DEAD_LETTER"].includes(delivery.jobStatus);
  if (!retryable) {
    return null;
  }
  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-ink disabled:opacity-50"
      disabled={busy}
      type="button"
      onClick={() => void onRetry(delivery.id)}
    >
      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
      立即重試
    </button>
  );
}

export function NotificationHealthPanel({
  integrations,
  health,
  deliveries,
  timezone,
  isSubmitting,
  onRetry,
}: {
  integrations: Integration[];
  health: MerchantWorkspaceData["notificationHealth"];
  deliveries: Delivery[];
  timezone: string;
  isSubmitting: boolean;
  onRetry: (deliveryId: string) => Promise<void>;
}) {
  const integrationByChannel = new Map(
    integrations.map((integration) => [integration.channel, integration]),
  );
  const healthItems = [
    { label: "等待中", value: health.pending, icon: Clock3 },
    { label: "處理中", value: health.processing, icon: Send },
    { label: "待重試", value: health.failed, icon: RefreshCw },
    { label: "需處理", value: health.deadLetter, icon: CircleAlert },
  ];

  return (
    <div className="space-y-7">
      <section aria-labelledby="notification-health-heading">
        <div className="mb-3 flex items-center gap-2">
          <Bell aria-hidden="true" className="h-5 w-5 text-teal" />
          <h2 className="font-semibold text-ink" id="notification-health-heading">
            通知健康狀態
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:grid-cols-4">
          {healthItems.map((item) => {
            const Icon = item.icon;
            return (
              <div className="bg-white px-4 py-4" key={item.label}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500">
                    {item.label}
                  </p>
                  <Icon aria-hidden="true" className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {item.value}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="notification-channel-heading">
        <h2 className="mb-3 font-semibold text-ink" id="notification-channel-heading">
          通知通道
        </h2>
        <div className="grid gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:grid-cols-3">
          {(["LINE", "EMAIL", "SMS"] as const).map((channel) => {
            const integration = integrationByChannel.get(channel);
            const active = integration?.status === "ACTIVE";
            return (
              <div className="bg-white px-5 py-4" key={channel}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{channel}</p>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {active ? "已啟用" : "未啟用"}
                  </span>
                </div>
                {integration?.lastErrorCode ? (
                  <p className="mt-2 break-all text-xs text-red-600">
                    {integration.lastErrorCode}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="notification-delivery-heading">
        <h2 className="mb-3 font-semibold text-ink" id="notification-delivery-heading">
          最近通知結果
        </h2>
        {deliveries.length === 0 ? (
          <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
            <p className="font-semibold text-ink">尚未有通知紀錄</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white sm:hidden">
              {deliveries.map((delivery) => (
                <article className="px-4 py-4" key={delivery.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {eventLabels[delivery.eventType] ?? delivery.eventType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDeliveryTime(delivery.createdAt, timezone)} ·{" "}
                        {delivery.channel}
                      </p>
                    </div>
                    <DeliveryStatus delivery={delivery} />
                  </div>
                  {delivery.errorCode ? (
                    <p className="mt-3 break-all text-xs text-red-600">
                      {delivery.errorCode}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      嘗試 {delivery.attemptCount}/{delivery.maxAttempts}
                    </span>
                    <RetryButton
                      busy={isSubmitting}
                      delivery={delivery}
                      onRetry={onRetry}
                    />
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto border-y border-slate-200 bg-white sm:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">時間</th>
                    <th className="px-4 py-3 font-medium">事件</th>
                    <th className="px-4 py-3 font-medium">通道</th>
                    <th className="px-4 py-3 font-medium">結果</th>
                    <th className="px-4 py-3 font-medium">錯誤碼</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDeliveryTime(delivery.createdAt, timezone)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink">
                        {eventLabels[delivery.eventType] ?? delivery.eventType}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.channel}
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryStatus delivery={delivery} />
                      </td>
                      <td className="max-w-56 break-all px-4 py-3 text-xs text-slate-500">
                        {delivery.errorCode ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <RetryButton
                          busy={isSubmitting}
                          delivery={delivery}
                          onRetry={onRetry}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

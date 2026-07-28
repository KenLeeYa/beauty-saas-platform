"use client";

import { CalendarDays, Check, Play, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { LogoutButton } from "./logout-button";
import { MonthCalendar } from "./month-calendar";
import type { StaffWorkspaceData } from "@/server/staff/data";

type ApiEnvelope = {
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
  PENDING_PAYMENT: "待訂金",
  CONFIRMED: "已確認",
  CHECKED_IN: "已報到",
  IN_SERVICE: "服務中",
  COMPLETED: "已完成",
  NO_SHOW: "未到店",
  CANCELLED: "已取消",
  EXPIRED: "已失效",
  RESCHEDULED: "已改期",
};

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function localDate(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function localTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function StaffWorkspace({
  initialData,
}: {
  initialData: StaffWorkspaceData;
}) {
  const [data, setData] = useState(initialData);
  const [selectedDate, setSelectedDate] = useState(() =>
    localDate(new Date(), data.location.timezone),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dayBookings = useMemo(
    () =>
      data.bookings
        .filter(
          (booking) =>
            localDate(
              new Date(booking.startsAt),
              data.location.timezone,
            ) === selectedDate,
        )
        .sort((left, right) =>
          left.startsAt.localeCompare(right.startsAt),
        ),
    [data.bookings, data.location.timezone, selectedDate],
  );
  const scope = `organization=${encodeURIComponent(
    data.organization.slug,
  )}&location=${encodeURIComponent(data.location.slug)}`;

  async function updateStatus(
    booking: StaffWorkspaceData["bookings"][number],
    nextStatus: string,
  ): Promise<void> {
    setPendingId(booking.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/merchant/bookings/status?${scope}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({
            bookingId: booking.id,
            nextStatus,
            expectedVersion: booking.version,
            ...(nextStatus === "NO_SHOW"
              ? { reason: "服務人員標記未到店" }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as ApiEnvelope;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "更新預約失敗。");
      }

      setData((current) => ({
        ...current,
        bookings: current.bookings.map((item) =>
          item.id === payload.data?.id
            ? {
                ...item,
                status: payload.data.status,
                version: payload.data.version,
              }
            : item,
        ),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "更新預約失敗。",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">
              {data.organization.name}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              {data.location.name} · 我的預約
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm font-semibold text-ink sm:block">
              {data.session.displayName}
            </p>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays
              aria-hidden="true"
              className="h-5 w-5 text-teal"
            />
            <h2 className="text-lg font-semibold text-ink">月行事曆</h2>
          </div>
          <MonthCalendar
            audience="merchant"
            days={data.calendarDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </section>

        <section className="min-w-0">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-ink">
              {selectedDate} 預約
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              僅顯示指派給你的服務
            </p>
          </div>
          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <div className="space-y-3">
            {dayBookings.map((booking) => (
              <article
                key={booking.id}
                className="rounded-md border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {localTime(
                        booking.startsAt,
                        data.location.timezone,
                      )}{" "}
                      {booking.customerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {booking.serviceName} · {booking.variantName}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-sm bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {statusLabels[booking.status] ?? booking.status}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.status === "CONFIRMED" ? (
                    <>
                      <button
                        className="flex h-9 items-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                        disabled={pendingId === booking.id}
                        type="button"
                        onClick={() =>
                          void updateStatus(booking, "CHECKED_IN")
                        }
                      >
                        <UserCheck
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                        報到
                      </button>
                      <button
                        className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-60"
                        disabled={pendingId === booking.id}
                        type="button"
                        onClick={() =>
                          void updateStatus(booking, "NO_SHOW")
                        }
                      >
                        未到店
                      </button>
                    </>
                  ) : null}
                  {booking.status === "CHECKED_IN" ? (
                    <button
                      className="flex h-9 items-center gap-2 rounded-md bg-coral px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                      disabled={pendingId === booking.id}
                      type="button"
                      onClick={() =>
                        void updateStatus(booking, "IN_SERVICE")
                      }
                    >
                      <Play aria-hidden="true" className="h-4 w-4" />
                      開始服務
                    </button>
                  ) : null}
                  {booking.status === "IN_SERVICE" ? (
                    <button
                      className="flex h-9 items-center gap-2 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                      disabled={pendingId === booking.id}
                      type="button"
                      onClick={() =>
                        void updateStatus(booking, "COMPLETED")
                      }
                    >
                      <Check aria-hidden="true" className="h-4 w-4" />
                      完成服務
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {dayBookings.length === 0 ? (
              <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
                <p className="font-semibold text-ink">當日沒有預約</p>
                <p className="mt-2 text-sm text-slate-500">
                  可從月曆切換其他日期。
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

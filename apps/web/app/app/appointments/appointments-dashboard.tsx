"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appointmentStatuses,
  type ApiResponse,
  type PublicBooking,
  type PublicBookingAppointmentStatus,
  type PublicBookingOptions
} from "@beauty-saas/shared";

type AppointmentStatusFilter = PublicBookingAppointmentStatus | "";

type AppointmentFilters = {
  branchId: string;
  staffId: string;
  status: AppointmentStatusFilter;
  date: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const emptyFilters: AppointmentFilters = {
  branchId: "",
  staffId: "",
  status: "",
  date: ""
};

const statusLabels: Record<PublicBookingAppointmentStatus, string> = {
  PENDING_CONFIRMATION: "待確認",
  CONFIRMED: "已確認",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  NO_SHOW: "未到"
};

const statusClasses: Record<PublicBookingAppointmentStatus, string> = {
  PENDING_CONFIRMATION: "border-amber-200 bg-amber-50 text-amber-700",
  CONFIRMED: "border-teal/30 bg-teal/10 text-teal",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-600",
  NO_SHOW: "border-red-200 bg-red-50 text-red-700"
};

const nextStatuses: PublicBookingAppointmentStatus[] = ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

function currency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTime(booking: PublicBooking): string {
  const date = new Date(`${booking.appointment.date}T${booking.appointment.time}:00+08:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: booking.branch.timezone
  }).format(date);
}

async function readApiData<TData>(response: Response): Promise<TData> {
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? "API request failed." : payload.error.message);
  }

  return payload.data;
}

function buildAppointmentsUrl(tenantSlug: string, filters: AppointmentFilters): string {
  const params = new URLSearchParams();
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.staffId) params.set("staffId", filters.staffId);
  if (filters.status) params.set("status", filters.status);
  if (filters.date) params.set("date", filters.date);

  const query = params.toString();
  return `${apiBaseUrl}/shop/tenants/${tenantSlug}/appointments${query ? `?${query}` : ""}`;
}

export function AppointmentsDashboard({ tenantSlug }: { tenantSlug: string }) {
  const [options, setOptions] = useState<PublicBookingOptions | null>(null);
  const [appointments, setAppointments] = useState<PublicBooking[]>([]);
  const [filters, setFilters] = useState<AppointmentFilters>(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/options`);
    return readApiData<PublicBookingOptions>(response);
  }, [tenantSlug]);

  const loadAppointments = useCallback(
    async (nextFilters: AppointmentFilters) => {
      const response = await fetch(buildAppointmentsUrl(tenantSlug, nextFilters), { cache: "no-store" });
      return readApiData<PublicBooking[]>(response);
    },
    [tenantSlug]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextOptions, nextAppointments] = await Promise.all([loadOptions(), loadAppointments(filters)]);
        if (!isMounted) return;
        setOptions(nextOptions);
        setAppointments(nextAppointments);
      } catch (cause) {
        if (!isMounted) return;
        setError(cause instanceof Error ? cause.message : "無法載入預約資料。");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [filters, loadAppointments, loadOptions]);

  const statusCounts = useMemo(() => {
    const counts: Record<PublicBookingAppointmentStatus, number> = {
      PENDING_CONFIRMATION: 0,
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0
    };

    appointments.forEach((booking) => {
      counts[booking.appointment.status] += 1;
    });

    return counts;
  }, [appointments]);

  async function refreshAppointments() {
    setIsRefreshing(true);
    setError(null);

    try {
      setAppointments(await loadAppointments(filters));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新整理預約資料失敗。");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function updateStatus(bookingId: string, status: PublicBookingAppointmentStatus) {
    setUpdatingId(bookingId);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/appointments/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const updated = await readApiData<PublicBooking>(response);
      setAppointments((current) => current.map((booking) => (booking.id === updated.id ? updated : booking)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新預約狀態失敗。");
    } finally {
      setUpdatingId(null);
    }
  }

  function updateFilters(next: Partial<AppointmentFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  return (
    <main className="min-h-screen bg-mist">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-semibold text-teal" href="/app">
              Shop Admin
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl md:text-5xl">預約管理</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">查看線上訂位、確認美容師時段，並即時更新預約狀態。</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
            <Link className="rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700" href="/t/demo/booking">
              開啟客人預約頁
            </Link>
            <button
              className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isRefreshing}
              type="button"
              onClick={() => {
                void refreshAppointments();
              }}
            >
              {isRefreshing ? "更新中" : "重新整理"}
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5">
        {error ? <p className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {appointmentStatuses.map((status) => (
            <button
              key={status}
              className={`rounded-lg border p-4 text-left transition ${
                filters.status === status ? statusClasses[status] : "border-slate-200 bg-white text-slate-700 hover:border-teal"
              }`}
              type="button"
              onClick={() => updateFilters({ status: filters.status === status ? "" : status })}
            >
              <span className="text-xs font-semibold">{statusLabels[status]}</span>
              <span className="mt-2 block text-2xl font-semibold">{statusCounts[status]}</span>
            </button>
          ))}
        </section>

        <section className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">分店</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm text-ink outline-none focus:border-teal"
              value={filters.branchId}
              onChange={(event) => updateFilters({ branchId: event.target.value })}
            >
              <option value="">全部分店</option>
              {options?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">美容師</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm text-ink outline-none focus:border-teal"
              value={filters.staffId}
              onChange={(event) => updateFilters({ staffId: event.target.value })}
            >
              <option value="">全部美容師</option>
              {options?.staff.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">日期</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm text-ink outline-none focus:border-teal"
              value={filters.date}
              onChange={(event) => updateFilters({ date: event.target.value })}
            >
              <option value="">全部日期</option>
              {options?.availableDates.map((date) => (
                <option key={date.date} value={date.date}>
                  {date.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700" type="button" onClick={() => setFilters(emptyFilters)}>
              清除篩選
            </button>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_1.3fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 max-lg:hidden">
            <span>預約時間</span>
            <span>客人</span>
            <span>服務</span>
            <span>狀態</span>
            <span>操作</span>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              <div className="h-16 animate-pulse rounded-md bg-slate-100" />
              <div className="h-16 animate-pulse rounded-md bg-slate-100" />
            </div>
          ) : null}

          {!isLoading && appointments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-lg font-semibold text-ink">目前沒有符合條件的預約</p>
              <p className="mt-2 text-sm text-slate-600">可以先從客人預約頁送出一筆測試資料。</p>
            </div>
          ) : null}

          {!isLoading
            ? appointments.map((booking) => (
                <article key={booking.id} className="grid gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_1.3fr] lg:items-center">
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-400 lg:hidden">預約時間</span>
                    <p className="font-semibold text-ink">{formatDateTime(booking)}</p>
                    <p className="mt-1 break-words text-sm text-slate-500">
                      {booking.branch.name} · {booking.staff.name} · {booking.appointment.durationMinutes} 分鐘
                    </p>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-400 lg:hidden">客人</span>
                    <p className="font-medium text-ink">{booking.customer.name}</p>
                    <p className="mt-1 break-words text-sm text-slate-500">{booking.customer.phone}</p>
                    {booking.customer.note ? <p className="mt-1 break-words text-xs text-slate-500">{booking.customer.note}</p> : null}
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-400 lg:hidden">服務</span>
                    <p className="font-medium text-ink">{booking.service.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{currency(booking.service.price)}</p>
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-400 lg:hidden">狀態</span>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[booking.appointment.status]}`}>
                      {statusLabels[booking.appointment.status]}
                    </span>
                  </div>

                  <div>
                    <span className="mb-2 block text-xs font-semibold text-slate-400 lg:hidden">操作</span>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {nextStatuses.map((status) => (
                        <button
                          key={status}
                          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:opacity-50"
                          disabled={updatingId === booking.id || booking.appointment.status === status}
                          type="button"
                          onClick={() => {
                            void updateStatus(booking.id, status);
                          }}
                        >
                          {statusLabels[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ))
            : null}
        </section>
      </div>
    </main>
  );
}

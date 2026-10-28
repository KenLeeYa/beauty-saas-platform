"use client";

import {
  Bell,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  List,
  RefreshCw,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appointmentStatuses,
  type ApiResponse,
  type PublicBooking,
  type PublicBookingAppointmentStatus,
  type PublicBookingCalendarDay,
  type PublicBookingNotification,
  type PublicBookingOptions
} from "@beauty-saas/shared";
import { AppHeader } from "../../../components/app-header";
import { MonthCalendar, type MonthCalendarDay } from "../../../components/month-calendar";

type WorkspaceView = "calendar" | "appointments";
type AppointmentStatusFilter = PublicBookingAppointmentStatus | "";

type MerchantFilters = {
  branchId: string;
  staffId: string;
  status: AppointmentStatusFilter;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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

async function readApiData<TData>(response: Response): Promise<TData> {
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? "API request failed." : payload.error.message);
  }

  return payload.data;
}

function currency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value);
}

function calendarSummary(days: PublicBookingCalendarDay[]): MonthCalendarDay[] {
  return days.map((day) => ({
    date: day.date,
    availableCount: day.slots.filter((slot) => slot.status === "AVAILABLE").length,
    bookedCount: day.slots.filter((slot) => slot.status === "BOOKED").length,
    closedCount: day.slots.filter((slot) => slot.status === "CLOSED").length
  }));
}

function formatAppointmentDate(booking: PublicBooking): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: booking.branch.timezone
  }).format(new Date(`${booking.appointment.date}T${booking.appointment.time}:00+08:00`));
}

function buildAppointmentsUrl(tenantSlug: string, filters: MerchantFilters): string {
  const params = new URLSearchParams();
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.staffId) params.set("staffId", filters.staffId);
  if (filters.status) params.set("status", filters.status);

  const query = params.toString();
  return `${apiBaseUrl}/shop/tenants/${tenantSlug}/appointments${query ? `?${query}` : ""}`;
}

export function AppointmentsDashboard({
  tenantSlug,
  displayName
}: {
  tenantSlug: string;
  displayName: string;
}) {
  const [view, setView] = useState<WorkspaceView>("calendar");
  const [options, setOptions] = useState<PublicBookingOptions | null>(null);
  const [calendar, setCalendar] = useState<PublicBookingCalendarDay[]>([]);
  const [appointments, setAppointments] = useState<PublicBooking[]>([]);
  const [notifications, setNotifications] = useState<PublicBookingNotification[]>([]);
  const [filters, setFilters] = useState<MerchantFilters>({ branchId: "", staffId: "", status: "" });
  const [selectedDate, setSelectedDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingSlot, setUpdatingSlot] = useState<string | null>(null);
  const [updatingAppointment, setUpdatingAppointment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCalendar = useCallback(
    async (branchId: string, staffId: string) => {
      const params = new URLSearchParams({ branchId, staffId, audience: "merchant" });
      const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/calendar?${params.toString()}`, {
        cache: "no-store"
      });
      return readApiData<PublicBookingCalendarDay[]>(response);
    },
    [tenantSlug]
  );

  const loadAppointments = useCallback(
    async (nextFilters: MerchantFilters) => {
      const response = await fetch(buildAppointmentsUrl(tenantSlug, nextFilters), { cache: "no-store" });
      return readApiData<PublicBooking[]>(response);
    },
    [tenantSlug]
  );

  const loadNotifications = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/notifications`, { cache: "no-store" });
    return readApiData<PublicBookingNotification[]>(response);
  }, [tenantSlug]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextOptions, nextNotifications] = await Promise.all([
          fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/options`, { cache: "no-store" }).then((response) =>
            readApiData<PublicBookingOptions>(response)
          ),
          loadNotifications()
        ]);
        if (!isMounted) return;

        setOptions(nextOptions);
        setNotifications(nextNotifications);
        setFilters((current) => ({
          ...current,
          branchId: nextOptions.branches[0]?.id ?? "",
          staffId: nextOptions.staff[0]?.id ?? ""
        }));
      } catch (cause) {
        if (!isMounted) return;
        setError(cause instanceof Error ? cause.message : "載入後台資料時發生錯誤。");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [loadNotifications, tenantSlug]);

  useEffect(() => {
    if (!filters.branchId || !filters.staffId) return;

    let isMounted = true;

    async function refreshScopedData() {
      setIsRefreshing(true);
      setError(null);

      try {
        const [nextCalendar, nextAppointments] = await Promise.all([
          loadCalendar(filters.branchId, filters.staffId),
          loadAppointments(filters)
        ]);
        if (!isMounted) return;

        setCalendar(nextCalendar);
        setAppointments(nextAppointments);
        setSelectedDate((current) =>
          nextCalendar.some((day) => day.date === current) ? current : (nextCalendar[0]?.date ?? "")
        );
      } catch (cause) {
        if (!isMounted) return;
        setError(cause instanceof Error ? cause.message : "更新後台資料時發生錯誤。");
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    }

    void refreshScopedData();

    return () => {
      isMounted = false;
    };
  }, [filters, loadAppointments, loadCalendar]);

  const selectedDay = useMemo(() => calendar.find((day) => day.date === selectedDate), [calendar, selectedDate]);
  const monthDays = useMemo(() => calendarSummary(calendar), [calendar]);
  const availableCount = useMemo(
    () => calendar.reduce((sum, day) => sum + day.slots.filter((slot) => slot.status === "AVAILABLE").length, 0),
    [calendar]
  );
  const bookedSlots = useMemo(
    () => calendar.flatMap((day) => day.slots).filter((slot) => slot.status === "BOOKED"),
    [calendar]
  );
  const revenue = useMemo(
    () => bookedSlots.reduce((sum, slot) => sum + (slot.servicePrice ?? 0), 0),
    [bookedSlots]
  );

  async function refreshAll() {
    if (!filters.branchId || !filters.staffId) return;
    setIsRefreshing(true);
    setError(null);

    try {
      const [nextCalendar, nextAppointments, nextNotifications] = await Promise.all([
        loadCalendar(filters.branchId, filters.staffId),
        loadAppointments(filters),
        loadNotifications()
      ]);
      setCalendar(nextCalendar);
      setAppointments(nextAppointments);
      setNotifications(nextNotifications);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新整理資料時發生錯誤。");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function toggleSlot(date: string, time: string, isOpen: boolean) {
    setUpdatingSlot(`${date}-${time}`);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/calendar/slot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: filters.branchId,
          staffId: filters.staffId,
          date,
          time,
          isOpen
        })
      });
      setCalendar(await readApiData<PublicBookingCalendarDay[]>(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新時段時發生錯誤。");
    } finally {
      setUpdatingSlot(null);
    }
  }

  async function updateStatus(bookingId: string, status: PublicBookingAppointmentStatus) {
    setUpdatingAppointment(bookingId);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/appointments/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const updated = await readApiData<PublicBooking>(response);
      setAppointments((current) => current.map((booking) => (booking.id === updated.id ? updated : booking)));
      if (filters.branchId && filters.staffId) {
        setCalendar(await loadCalendar(filters.branchId, filters.staffId));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新預約狀態時發生錯誤。");
    } finally {
      setUpdatingAppointment(null);
    }
  }

  return (
    <main className="min-h-screen bg-mist">
      <AppHeader displayName={displayName} role="merchant" />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal">Lumi Beauty Studio</p>
            <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">預約營運</h1>
            <p className="mt-2 text-sm text-slate-500">管理開放時段、確認新預約與追蹤每日營收。</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1">
              <button
                className={`flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                  view === "calendar" ? "bg-white text-ink shadow-sm" : "text-slate-500"
                }`}
                type="button"
                onClick={() => setView("calendar")}
              >
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
                行事曆
              </button>
              <button
                className={`flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                  view === "appointments" ? "bg-white text-ink shadow-sm" : "text-slate-500"
                }`}
                type="button"
                onClick={() => setView("appointments")}
              >
                <List aria-hidden="true" className="h-4 w-4" />
                預約清單
              </button>
            </div>
            <button
              aria-label="重新整理"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-ink disabled:opacity-50"
              disabled={isRefreshing}
              title="重新整理"
              type="button"
              onClick={() => {
                void refreshAll();
              }}
            >
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5">
        {error ? <p className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="mb-5 grid gap-3 border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">分店</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-ink outline-none focus:border-teal"
              value={filters.branchId}
              onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value }))}
            >
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
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-ink outline-none focus:border-teal"
              value={filters.staffId}
              onChange={(event) => setFilters((current) => ({ ...current, staffId: event.target.value }))}
            >
              {options?.staff.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-1 lg:min-w-80">
            <div className="flex min-h-16 flex-col justify-center border-l-2 border-emerald-500 bg-emerald-50 px-3">
              <span className="text-xs text-emerald-700">可約</span>
              <span className="mt-1 font-semibold text-ink">{availableCount}</span>
            </div>
            <div className="flex min-h-16 flex-col justify-center border-l-2 border-amber-500 bg-amber-50 px-3">
              <span className="text-xs text-amber-700">預約</span>
              <span className="mt-1 font-semibold text-ink">{bookedSlots.length}</span>
            </div>
            <div className="flex min-h-16 flex-col justify-center border-l-2 border-coral bg-red-50 px-3">
              <span className="text-xs text-red-700">金額</span>
              <span className="mt-1 truncate font-semibold text-ink">{currency(revenue)}</span>
            </div>
          </div>
        </section>

        {isLoading ? <div className="h-96 animate-pulse rounded-md bg-white" /> : null}

        {!isLoading && view === "calendar" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 border border-slate-200 bg-white">
              <header className="border-b border-slate-200 px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <CalendarDays aria-hidden="true" className="h-4 w-4 text-teal" />
                  月行事曆
                </h2>
                <p className="mt-1 text-xs text-slate-500">點選日期後，在右側管理當日可預約時段。</p>
              </header>
              <div className="p-4 sm:p-5">
                <MonthCalendar
                  audience="merchant"
                  days={monthDays}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              </div>
            </section>

            <div className="space-y-5">
              <section className="border border-slate-200 bg-white">
                <header className="border-b border-slate-200 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Clock3 aria-hidden="true" className="h-4 w-4 text-teal" />
                    {selectedDay?.label ?? "請選擇日期"}
                  </h2>
                </header>
                <div className="max-h-[560px] space-y-2 overflow-y-auto p-4">
                  {(selectedDay?.slots ?? []).map((slot) => {
                    const slotKey = `${slot.date}-${slot.time}`;

                    return (
                      <button
                        key={slotKey}
                        className={`w-full rounded-md border px-4 py-3 text-left transition ${
                          slot.status === "BOOKED"
                            ? "cursor-default border-amber-200 bg-amber-50"
                            : slot.status === "CLOSED"
                              ? "border-slate-200 bg-slate-100"
                              : "border-slate-200 bg-white hover:border-teal"
                        } disabled:opacity-60`}
                        disabled={slot.status === "BOOKED" || updatingSlot === slotKey}
                        type="button"
                        onClick={() => {
                          void toggleSlot(slot.date, slot.time, slot.status === "CLOSED");
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-ink">{slot.time}</span>
                          <span
                            className={`text-xs font-semibold ${
                              slot.status === "BOOKED"
                                ? "text-amber-700"
                                : slot.status === "CLOSED"
                                  ? "text-slate-500"
                                  : "text-emerald-700"
                            }`}
                          >
                            {slot.status === "BOOKED" ? "已預約" : slot.status === "CLOSED" ? "不開放" : "可預約"}
                          </span>
                        </span>
                        {slot.status === "BOOKED" ? (
                          <span className="mt-2 block text-xs leading-5 text-slate-600">
                            {slot.customerName} · {slot.serviceName} · {slot.servicePrice ? currency(slot.servicePrice) : "-"}
                          </span>
                        ) : (
                          <span className="mt-2 block text-xs text-slate-400">
                            {slot.status === "CLOSED" ? "點擊重新開放" : "點擊關閉此時段"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Bell aria-hidden="true" className="h-4 w-4 text-coral" />
                    最新通知
                  </h2>
                  <span className="text-xs text-slate-400">{notifications.length}</span>
                </header>
                <div className="divide-y divide-slate-100">
                  {notifications.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">目前沒有新通知。</p> : null}
                  {notifications.slice(0, 4).map((notification) => (
                    <article key={notification.id} className="px-5 py-4">
                      <p className="text-sm font-semibold text-ink">{notification.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{notification.message}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {!isLoading && view === "appointments" ? (
          <section className="border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Users aria-hidden="true" className="h-4 w-4 text-teal" />
                    預約清單
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">確認新預約，並更新到店或取消狀態。</p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {appointmentStatuses.map((status) => (
                    <button
                      key={status}
                      className={`min-h-10 rounded-md border px-3 py-2 text-xs font-semibold ${
                        filters.status === status ? statusClasses[status] : "border-slate-200 text-slate-500 hover:border-teal"
                      }`}
                      type="button"
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          status: current.status === status ? "" : status
                        }))
                      }
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {appointments.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <CircleDollarSign aria-hidden="true" className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-4 font-semibold text-ink">目前沒有符合條件的預約</p>
                <p className="mt-2 text-sm text-slate-500">顧客完成線上預約後，資料會立即出現在這裡。</p>
              </div>
            ) : null}

            <div className="divide-y divide-slate-100">
              {appointments.map((booking) => (
                <article
                  key={booking.id}
                  className="grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[1.05fr_0.85fr_0.8fr_0.7fr_1.3fr] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{formatAppointmentDate(booking)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {booking.branch.name} · {booking.staff.name} · {booking.appointment.durationMinutes} 分鐘
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{booking.customer.name}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{booking.customer.phone}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{booking.service.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{currency(booking.service.price)}</p>
                  </div>
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[booking.appointment.status]}`}>
                      {statusLabels[booking.appointment.status]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {nextStatuses.map((status) => (
                      <button
                        key={status}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-teal hover:text-teal disabled:opacity-40"
                        disabled={updatingAppointment === booking.id || booking.appointment.status === status}
                        type="button"
                        onClick={() => {
                          void updateStatus(booking.id, status);
                        }}
                      >
                        {statusLabels[status]}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

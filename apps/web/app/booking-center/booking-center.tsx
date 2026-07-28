"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiResponse,
  PublicBooking,
  PublicBookingCalendarDay,
  PublicBookingCalendarSlot,
  PublicBookingNotification,
  PublicBookingOptions,
  PublicBookingSlotStatus
} from "@beauty-saas/shared";

type Mode = "merchant" | "customer";

type CustomerForm = {
  branchId: string;
  staffId: string;
  serviceId: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const emptyCustomerForm: CustomerForm = {
  branchId: "",
  staffId: "staff-any",
  serviceId: "",
  date: "",
  time: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  note: ""
};

const slotLabels: Record<PublicBookingSlotStatus, string> = {
  AVAILABLE: "可預約",
  BOOKED: "已有顧客預約",
  CLOSED: "不開放"
};

const slotClasses: Record<PublicBookingSlotStatus, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  BOOKED: "border-amber-200 bg-amber-50 text-amber-800",
  CLOSED: "border-slate-200 bg-slate-100 text-slate-500"
};

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

function formatReminderTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei"
  }).format(new Date(value));
}

function buildCalendarUrl(tenantSlug: string, audience: Mode, branchId: string, staffId: string): string {
  const params = new URLSearchParams();
  params.set("branchId", branchId);
  params.set("staffId", staffId);

  if (audience === "merchant") {
    params.set("audience", "merchant");
    return `${apiBaseUrl}/shop/tenants/${tenantSlug}/calendar?${params.toString()}`;
  }

  return `${apiBaseUrl}/public/tenants/${tenantSlug}/booking/calendar?${params.toString()}`;
}

function slotButtonLabel(slot: PublicBookingCalendarSlot, mode: Mode): string {
  if (slot.status === "AVAILABLE") return `${slot.time} 可預約`;
  if (slot.status === "CLOSED") return `${slot.time} 不開放`;
  return mode === "merchant" && slot.customerName ? `${slot.time} ${slot.customerName}` : `${slot.time} 已有顧客預約`;
}

export function BookingCenter({ tenantSlug }: { tenantSlug: string }) {
  const [mode, setMode] = useState<Mode>("merchant");
  const [options, setOptions] = useState<PublicBookingOptions | null>(null);
  const [merchantCalendar, setMerchantCalendar] = useState<PublicBookingCalendarDay[]>([]);
  const [customerCalendar, setCustomerCalendar] = useState<PublicBookingCalendarDay[]>([]);
  const [notifications, setNotifications] = useState<PublicBookingNotification[]>([]);
  const [form, setForm] = useState<CustomerForm>(emptyCustomerForm);
  const [selectedSlot, setSelectedSlot] = useState<PublicBookingCalendarSlot | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingSlot, setUpdatingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedService = useMemo(() => options?.services.find((service) => service.id === form.serviceId), [form.serviceId, options]);
  const totalRevenue = useMemo(
    () =>
      merchantCalendar.reduce(
        (sum, day) => sum + day.slots.reduce((daySum, slot) => daySum + (slot.status === "BOOKED" ? slot.servicePrice ?? 0 : 0), 0),
        0
      ),
    [merchantCalendar]
  );
  const bookedCount = useMemo(() => merchantCalendar.reduce((sum, day) => sum + day.slots.filter((slot) => slot.status === "BOOKED").length, 0), [merchantCalendar]);
  const availableCount = useMemo(() => merchantCalendar.reduce((sum, day) => sum + day.slots.filter((slot) => slot.status === "AVAILABLE").length, 0), [merchantCalendar]);

  const loadCalendar = useCallback(async (audience: Mode, branchId: string, staffId: string) => {
    const response = await fetch(buildCalendarUrl(tenantSlug, audience, branchId, staffId), { cache: "no-store" });
    return readApiData<PublicBookingCalendarDay[]>(response);
  }, [tenantSlug]);

  const refreshData = useCallback(
    async (nextForm: CustomerForm) => {
      const [merchant, customer, nextNotifications] = await Promise.all([
        loadCalendar("merchant", nextForm.branchId, nextForm.staffId),
        loadCalendar("customer", nextForm.branchId, nextForm.staffId),
        fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/notifications`, { cache: "no-store" }).then((response) =>
          readApiData<PublicBookingNotification[]>(response)
        )
      ]);
      setMerchantCalendar(merchant);
      setCustomerCalendar(customer);
      setNotifications(nextNotifications);
    },
    [loadCalendar, tenantSlug]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/options`);
        const nextOptions = await readApiData<PublicBookingOptions>(response);
        const nextForm = {
          ...emptyCustomerForm,
          branchId: nextOptions.branches[0]?.id ?? "",
          staffId: nextOptions.staff[0]?.id ?? "staff-any",
          serviceId: nextOptions.services[0]?.id ?? ""
        };

        if (!isMounted) return;
        setOptions(nextOptions);
        setForm(nextForm);
        await refreshData(nextForm);
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
  }, [refreshData, tenantSlug]);

  async function changeForm(next: Partial<CustomerForm>) {
    const nextForm = { ...form, ...next };
    setForm(nextForm);
    setSelectedSlot(null);
    setConfirmedBooking(null);

    if (next.branchId || next.staffId) {
      setError(null);
      try {
        await refreshData(nextForm);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "更新日曆失敗。");
      }
    }
  }

  async function toggleSlot(slot: PublicBookingCalendarSlot) {
    if (slot.status === "BOOKED") return;

    const nextIsOpen = slot.status === "CLOSED";
    setUpdatingSlot(`${slot.date}-${slot.time}`);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/shop/tenants/${tenantSlug}/calendar/slot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: form.branchId,
          staffId: form.staffId,
          date: slot.date,
          time: slot.time,
          isOpen: nextIsOpen
        })
      });
      const nextCalendar = await readApiData<PublicBookingCalendarDay[]>(response);
      setMerchantCalendar(nextCalendar);
      setCustomerCalendar(await loadCalendar("customer", form.branchId, form.staffId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新時段失敗。");
    } finally {
      setUpdatingSlot(null);
    }
  }

  function chooseCustomerSlot(slot: PublicBookingCalendarSlot) {
    if (slot.status !== "AVAILABLE") return;
    setSelectedSlot(slot);
    setConfirmedBooking(null);
    setForm((current) => ({ ...current, date: slot.date, time: slot.time }));
  }

  async function submitBooking() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: form.branchId,
          staffId: form.staffId,
          serviceId: form.serviceId,
          date: form.date,
          time: form.time,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim(),
          note: form.note.trim()
        })
      });
      const booking = await readApiData<PublicBooking>(response);
      setConfirmedBooking(booking);
      setSelectedSlot(null);
      await refreshData(form);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送出預約失敗。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-mist">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-semibold text-teal" href="/">
              Beauty SaaS Platform
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl md:text-5xl">線上預約中心</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">以日曆為主體，商家管理時段與預約，顧客只看到公開可預約狀態。</p>
          </div>
          <div className="grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:w-80">
            <button
              className={`rounded-md px-4 py-3 text-sm font-semibold ${mode === "merchant" ? "bg-ink text-white" : "text-slate-600"}`}
              type="button"
              onClick={() => setMode("merchant")}
            >
              商家模式
            </button>
            <button
              className={`rounded-md px-4 py-3 text-sm font-semibold ${mode === "customer" ? "bg-ink text-white" : "text-slate-600"}`}
              type="button"
              onClick={() => setMode("customer")}
            >
              顧客模式
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5">
        {error ? <p className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">分店</span>
            <select className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm" value={form.branchId} onChange={(event) => void changeForm({ branchId: event.target.value })}>
              {options?.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">美容師</span>
            <select className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm" value={form.staffId} onChange={(event) => void changeForm({ staffId: event.target.value })}>
              {options?.staff.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">服務項目</span>
            <select className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 text-sm" value={form.serviceId} onChange={(event) => void changeForm({ serviceId: event.target.value })}>
              {options?.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} / {currency(service.price)}
                </option>
              ))}
            </select>
          </label>
        </section>

        {mode === "merchant" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-ink">預約行事曆</h2>
                  <p className="mt-1 text-sm text-slate-600">可直接關閉休假或不營業時段；已預約時段不可關閉。</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 text-sm sm:flex sm:w-auto">
                  <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">可約 {availableCount}</span>
                  <span className="rounded-md bg-amber-50 px-3 py-2 text-amber-700">預約 {bookedCount}</span>
                  <span className="col-span-2 rounded-md bg-slate-100 px-3 py-2 text-slate-700 sm:col-span-1">金額 {currency(totalRevenue)}</span>
                </div>
              </div>

              {isLoading ? <div className="h-80 animate-pulse rounded-md bg-slate-100" /> : null}

              {!isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {merchantCalendar.map((day) => (
                    <section key={day.date} className="rounded-lg border border-slate-200 p-3">
                      <h3 className="font-semibold text-ink">{day.label}</h3>
                      <div className="mt-3 space-y-2">
                        {day.slots.map((slot) => (
                          <button
                            key={`${slot.date}-${slot.time}`}
                            className={`w-full rounded-md border px-3 py-3 text-left text-sm transition ${slotClasses[slot.status]} disabled:opacity-60`}
                            disabled={slot.status === "BOOKED" || updatingSlot === `${slot.date}-${slot.time}`}
                            type="button"
                            onClick={() => void toggleSlot(slot)}
                          >
                            <span className="font-semibold">{slotButtonLabel(slot, "merchant")}</span>
                            {slot.serviceName ? (
                              <span className="mt-1 block text-xs">
                                {slot.serviceName} / {slot.servicePrice ? currency(slot.servicePrice) : "-"}
                              </span>
                            ) : (
                              <span className="mt-1 block text-xs">{slot.status === "CLOSED" ? "點擊可重新開放" : "點擊可關閉"}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </section>

            <aside className="space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-ink">預約完成通知</h2>
                <div className="mt-4 space-y-3">
                  {notifications.length === 0 ? <p className="text-sm text-slate-600">目前沒有新通知。</p> : null}
                  {notifications.slice(0, 6).map((notification) => (
                    <article key={notification.id} className="min-w-0 break-words rounded-md border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-ink">{notification.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{notification.message}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-ink">發佈預約表</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">目前畫面可作為店家次月預約表草稿。後續若要發 IG/LINE 圖文，可再加一鍵匯出圖片。</p>
              </section>
            </aside>
          </div>
        ) : null}

        {mode === "customer" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="text-2xl font-semibold text-ink">選擇預約時段</h2>
              <p className="mt-1 text-sm text-slate-600">顧客只會看到時段狀態，不會看到前一位顧客姓名或電話。</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {customerCalendar.map((day, dayIndex) => (
                  <section key={day.date} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-ink">{day.label}</h3>
                      {dayIndex < 2 ? <span className="rounded-full bg-teal/10 px-2 py-1 text-xs font-semibold text-teal">{dayIndex === 0 ? "今日" : "明日"}</span> : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {day.slots.map((slot) => (
                        <button
                          key={`${slot.date}-${slot.time}`}
                          className={`w-full rounded-md border px-3 py-3 text-left text-sm transition ${slotClasses[slot.status]} ${
                            selectedSlot?.date === slot.date && selectedSlot.time === slot.time ? "ring-2 ring-ink" : ""
                          }`}
                          disabled={slot.status !== "AVAILABLE"}
                          type="button"
                          onClick={() => chooseCustomerSlot(slot)}
                        >
                          <span className="font-semibold">{slot.time}</span>
                          <span className="ml-2 text-xs">{slotLabels[slot.status]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <aside className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-ink">預約資料</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">日期時間</dt>
                  <dd className="mt-1 font-medium text-ink">{form.date && form.time ? `${form.date} ${form.time}` : "請先選擇時段"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">項目金額</dt>
                  <dd className="mt-1 font-medium text-ink">{selectedService ? `${selectedService.name} / ${currency(selectedService.price)}` : "-"}</dd>
                </div>
              </dl>

              <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitBooking();
                }}
              >
                <input className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm" required placeholder="姓名" value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} />
                <input className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm" required placeholder="電話" value={form.customerPhone} onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))} />
                <input className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm" type="email" placeholder="Email" value={form.customerEmail} onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))} />
                <textarea className="min-h-24 w-full rounded-md border border-slate-300 px-4 py-3 text-sm" placeholder="備註" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
                <button className="w-full rounded-md bg-coral px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={!form.date || !form.time || isSubmitting} type="submit">
                  {isSubmitting ? "送出中" : "送出預約"}
                </button>
              </form>

              {confirmedBooking ? (
                <section className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700">預約已建立</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">系統提醒時間：{formatReminderTime(confirmedBooking.appointment.customerReminderAt)}</p>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}

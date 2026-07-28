"use client";

import {
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  Sparkles,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiResponse,
  PublicBooking,
  PublicBookingCalendarDay,
  PublicBookingCalendarSlot,
  PublicBookingOptions,
  PublicBookingSlotStatus
} from "@beauty-saas/shared";
import { AppHeader } from "../../../../components/app-header";
import { MonthCalendar, type MonthCalendarDay } from "../../../../components/month-calendar";

type BookingStep = "service" | "schedule" | "details" | "done";

type BookingForm = {
  branchId: string;
  serviceId: string;
  staffId: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

const bookingSteps: Array<{ key: BookingStep; label: string }> = [
  { key: "service", label: "服務" },
  { key: "schedule", label: "日期時間" },
  { key: "details", label: "聯絡資料" },
  { key: "done", label: "完成" }
];

const slotStatusLabels: Record<PublicBookingSlotStatus, string> = {
  AVAILABLE: "可預約",
  BOOKED: "已被預約",
  CLOSED: "不開放"
};

async function readApiData<TData>(response: Response): Promise<TData> {
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.success ? "API request failed." : payload.error.message);
  }

  return payload.data;
}

function firstAvailableSlot(day: PublicBookingCalendarDay | undefined): PublicBookingCalendarSlot | undefined {
  return day?.slots.find((slot) => slot.status === "AVAILABLE");
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

function stepIndex(step: BookingStep): number {
  return bookingSteps.findIndex((item) => item.key === step);
}

export function BookingExperience({
  tenantSlug,
  customerName,
  customerEmail
}: {
  tenantSlug: string;
  customerName: string;
  customerEmail: string;
}) {
  const [options, setOptions] = useState<PublicBookingOptions | null>(null);
  const [calendar, setCalendar] = useState<PublicBookingCalendarDay[]>([]);
  const [form, setForm] = useState<BookingForm>(() => ({
    branchId: "",
    serviceId: "",
    staffId: "staff-any",
    date: "",
    time: "",
    customerName,
    customerPhone: "",
    customerEmail,
    note: ""
  }));
  const [step, setStep] = useState<BookingStep>("service");
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendar = useCallback(
    async (branchId: string, staffId: string): Promise<PublicBookingCalendarDay[]> => {
      const params = new URLSearchParams({ branchId, staffId });
      const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/calendar?${params.toString()}`, {
        cache: "no-store"
      });
      return readApiData<PublicBookingCalendarDay[]>(response);
    },
    [tenantSlug]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/options`, { cache: "no-store" });
        const data = await readApiData<PublicBookingOptions>(response);
        if (!isMounted) return;

        setOptions(data);
        setForm((current) => ({
          ...current,
          branchId: data.branches[0]?.id ?? "",
          serviceId: data.services[0]?.id ?? "",
          staffId: data.staff[0]?.id ?? "staff-any"
        }));
      } catch (cause) {
        if (!isMounted) return;
        setError(cause instanceof Error ? cause.message : "載入店家資料時發生錯誤。");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!form.branchId || !form.staffId) {
      setCalendar([]);
      return;
    }

    let isMounted = true;
    const branchId = form.branchId;
    const staffId = form.staffId;

    async function loadCalendar() {
      setIsCalendarLoading(true);
      setError(null);

      try {
        const data = await fetchCalendar(branchId, staffId);
        if (!isMounted) return;

        setCalendar(data);
        setForm((current) => {
          if (current.branchId !== branchId || current.staffId !== staffId) return current;

          const currentDay = data.find((day) => day.date === current.date);
          const selectedDay = currentDay && firstAvailableSlot(currentDay) ? currentDay : data.find((day) => firstAvailableSlot(day));
          const currentSlot = selectedDay?.slots.find(
            (slot) => slot.time === current.time && slot.status === "AVAILABLE"
          );
          const selectedSlot = currentSlot ?? firstAvailableSlot(selectedDay);

          return {
            ...current,
            date: selectedDay?.date ?? "",
            time: selectedSlot?.time ?? ""
          };
        });
      } catch (cause) {
        if (!isMounted) return;
        setCalendar([]);
        setError(cause instanceof Error ? cause.message : "載入可預約時段時發生錯誤。");
      } finally {
        if (isMounted) setIsCalendarLoading(false);
      }
    }

    void loadCalendar();

    return () => {
      isMounted = false;
    };
  }, [fetchCalendar, form.branchId, form.staffId]);

  const selectedBranch = useMemo(() => options?.branches.find((branch) => branch.id === form.branchId), [form.branchId, options]);
  const selectedService = useMemo(() => options?.services.find((service) => service.id === form.serviceId), [form.serviceId, options]);
  const selectedStaff = useMemo(() => options?.staff.find((staff) => staff.id === form.staffId), [form.staffId, options]);
  const selectedDate = useMemo(() => calendar.find((day) => day.date === form.date), [calendar, form.date]);
  const monthDays = useMemo(() => calendarSummary(calendar), [calendar]);
  const currentStepIndex = stepIndex(step);

  function updateForm(next: Partial<BookingForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function selectDate(date: string) {
    const day = calendar.find((item) => item.date === date);
    const slot = firstAvailableSlot(day);
    updateForm({ date, time: slot?.time ?? "" });
  }

  function goToStep(nextStep: BookingStep) {
    if (nextStep === "done" && !booking) return;
    if (stepIndex(nextStep) <= currentStepIndex) {
      setStep(nextStep);
    }
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
          serviceId: form.serviceId,
          staffId: form.staffId,
          date: form.date,
          time: form.time,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim(),
          note: form.note.trim()
        })
      });
      const createdBooking = await readApiData<PublicBooking>(response);
      setBooking(createdBooking);
      setStep("done");

      try {
        setCalendar(await fetchCalendar(form.branchId, form.staffId));
      } catch {
        setError("預約已完成，但時段狀態暫時無法更新，請重新整理頁面。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送出預約時發生錯誤。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnotherBooking() {
    const availableDay = calendar.find((day) => firstAvailableSlot(day));
    const availableSlot = firstAvailableSlot(availableDay);
    setBooking(null);
    setForm((current) => ({
      ...current,
      date: availableDay?.date ?? "",
      time: availableSlot?.time ?? "",
      customerPhone: "",
      note: ""
    }));
    setStep("service");
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-mist">
        <AppHeader displayName={customerName} role="customer" />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
          <div className="h-80 animate-pulse rounded-md bg-white" />
        </div>
      </main>
    );
  }

  if (!options) {
    return (
      <main className="min-h-screen bg-mist">
        <AppHeader displayName={customerName} role="customer" />
        <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-5">
          <p className="text-sm font-semibold text-red-600">預約頁暫時無法使用</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{error ?? "找不到店家預約資訊。"}</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mist">
      <AppHeader displayName={customerName} role="customer" />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5">
          <p className="text-sm font-semibold text-teal">{options.tenant.name}</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-ink sm:text-3xl">線上預約</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{options.tenant.bookingNotice}</p>
            </div>
            <p className="text-xs text-slate-500">時間依店家時區 Asia/Taipei 顯示</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5">
        <nav aria-label="預約進度" className="mb-6 grid grid-cols-4 border-b border-slate-200 bg-white">
          {bookingSteps.map((item, index) => {
            const isActive = item.key === step;
            const isDone = index < currentStepIndex;
            const canNavigate = index <= currentStepIndex && (item.key !== "done" || Boolean(booking));

            return (
              <button
                key={item.key}
                className={`flex min-h-14 items-center justify-center gap-2 border-b-2 px-2 text-xs font-semibold sm:text-sm ${
                  isActive
                    ? "border-ink text-ink"
                    : isDone
                      ? "border-transparent text-teal"
                      : "border-transparent text-slate-400"
                } disabled:cursor-default`}
                disabled={!canNavigate}
                type="button"
                onClick={() => goToStep(item.key)}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isActive ? "bg-ink text-white" : isDone ? "bg-teal text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {isDone ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="hidden min-[380px]:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {error ? <p className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 bg-white">
            {step === "service" ? (
              <div>
                <header className="border-b border-slate-200 px-4 py-5 sm:px-6">
                  <h2 className="text-lg font-semibold text-ink">選擇分店與服務</h2>
                  <p className="mt-1 text-sm text-slate-500">先確認服務地點與本次預約項目。</p>
                </header>

                <div className="px-4 py-5 sm:px-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    {options.branches.map((branch) => (
                      <button
                        key={branch.id}
                        className={`min-h-28 rounded-md border p-4 text-left transition ${
                          form.branchId === branch.id ? "border-teal bg-teal/5" : "border-slate-200 hover:border-teal"
                        }`}
                        type="button"
                        onClick={() => updateForm({ branchId: branch.id })}
                      >
                        <span className="flex items-center gap-2 font-semibold text-ink">
                          <Building2 aria-hidden="true" className="h-4 w-4 text-teal" />
                          {branch.name}
                        </span>
                        <span className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-500">
                          <MapPin aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0" />
                          {branch.address}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {options.services.map((service) => (
                      <button
                        key={service.id}
                        className={`min-h-36 rounded-md border p-4 text-left transition ${
                          form.serviceId === service.id ? "border-coral bg-red-50" : "border-slate-200 hover:border-coral"
                        }`}
                        type="button"
                        onClick={() => updateForm({ serviceId: service.id })}
                      >
                        <span className="text-xs font-semibold text-coral">{service.category}</span>
                        <span className="mt-1 block font-semibold text-ink">{service.name}</span>
                        <span className="mt-2 block text-sm leading-6 text-slate-500">{service.description}</span>
                        <span className="mt-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                          <span>{service.durationMinutes} 分鐘</span>
                          <span>{currency(service.price)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <footer className="flex justify-end border-t border-slate-200 px-4 py-4 sm:px-6">
                  <button
                    className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white"
                    type="button"
                    onClick={() => setStep("schedule")}
                  >
                    選擇日期時間
                  </button>
                </footer>
              </div>
            ) : null}

            {step === "schedule" ? (
              <div>
                <header className="border-b border-slate-200 px-4 py-5 sm:px-6">
                  <h2 className="text-lg font-semibold text-ink">選擇日期與時段</h2>
                  <p className="mt-1 text-sm text-slate-500">點選月曆日期後，只顯示該日的預約時段。</p>
                </header>

                <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
                  <p className="mb-3 text-xs font-semibold text-slate-500">服務人員</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {options.staff.map((staff) => (
                      <button
                        key={staff.id}
                        className={`rounded-md border px-3 py-3 text-left ${
                          form.staffId === staff.id ? "border-teal bg-teal/5" : "border-slate-200 hover:border-teal"
                        }`}
                        type="button"
                        onClick={() => updateForm({ staffId: staff.id })}
                      >
                        <span className="block text-sm font-semibold text-ink">{staff.name}</span>
                        <span className="mt-1 block text-xs text-slate-500">{staff.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {isCalendarLoading ? <div className="m-5 h-80 animate-pulse rounded-md bg-slate-100" /> : null}

                {!isCalendarLoading ? (
                  <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="min-w-0 p-4 sm:p-6">
                      <MonthCalendar
                        audience="customer"
                        days={monthDays}
                        selectedDate={form.date}
                        onSelectDate={selectDate}
                      />
                    </div>

                    <aside className="border-t border-slate-200 p-4 sm:p-6 lg:border-l lg:border-t-0">
                      <div className="flex items-center gap-2">
                        <Clock3 aria-hidden="true" className="h-4 w-4 text-teal" />
                        <h3 className="text-sm font-semibold text-ink">{selectedDate?.label ?? "請選擇日期"}</h3>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
                        {(selectedDate?.slots ?? []).map((slot) => (
                          <button
                            key={`${slot.date}-${slot.time}`}
                            className={`flex min-h-14 items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                              form.time === slot.time
                                ? "border-ink bg-ink text-white"
                                : slot.status === "BOOKED"
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : slot.status === "CLOSED"
                                    ? "border-slate-200 bg-slate-100 text-slate-400"
                                    : "border-slate-200 bg-white text-ink hover:border-teal"
                            } disabled:cursor-not-allowed`}
                            disabled={slot.status !== "AVAILABLE"}
                            type="button"
                            onClick={() => updateForm({ time: slot.time })}
                          >
                            <span className="font-semibold">{slot.time}</span>
                            <span className="text-[10px] font-medium">{slotStatusLabels[slot.status]}</span>
                          </button>
                        ))}
                      </div>
                    </aside>
                  </div>
                ) : null}

                <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-4 sm:px-6">
                  <button
                    className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                    type="button"
                    onClick={() => setStep("service")}
                  >
                    上一步
                  </button>
                  <button
                    className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!form.date || !form.time}
                    type="button"
                    onClick={() => setStep("details")}
                  >
                    填寫聯絡資料
                  </button>
                </footer>
              </div>
            ) : null}

            {step === "details" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitBooking();
                }}
              >
                <header className="border-b border-slate-200 px-4 py-5 sm:px-6">
                  <h2 className="text-lg font-semibold text-ink">確認聯絡資料</h2>
                  <p className="mt-1 text-sm text-slate-500">店家將使用這些資訊確認或聯繫本次預約。</p>
                </header>

                <div className="grid gap-5 px-4 py-5 sm:grid-cols-2 sm:px-6">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">姓名</span>
                    <input
                      required
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 px-4 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
                      value={form.customerName}
                      onChange={(event) => updateForm({ customerName: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">手機</span>
                    <input
                      required
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 px-4 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
                      inputMode="tel"
                      placeholder="0912-345-678"
                      value={form.customerPhone}
                      onChange={(event) => updateForm({ customerPhone: event.target.value })}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Email</span>
                    <input
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 px-4 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
                      type="email"
                      value={form.customerEmail}
                      onChange={(event) => updateForm({ customerEmail: event.target.value })}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">備註</span>
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-4 py-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
                      placeholder="例如：肌膚容易敏感，想先諮詢適合的療程"
                      value={form.note}
                      onChange={(event) => updateForm({ note: event.target.value })}
                    />
                  </label>
                </div>

                <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-4 sm:px-6">
                  <button
                    className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                    type="button"
                    onClick={() => setStep("schedule")}
                  >
                    上一步
                  </button>
                  <button
                    className="rounded-md bg-coral px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                    disabled={!form.date || !form.time || isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? "送出中" : "確認預約"}
                  </button>
                </footer>
              </form>
            ) : null}

            {step === "done" && booking ? (
              <div className="px-5 py-12 text-center sm:px-8 sm:py-16">
                <CheckCircle2 aria-hidden="true" className="mx-auto h-12 w-12 text-emerald-600" />
                <p className="mt-5 text-sm font-semibold text-emerald-700">預約已送出</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">等待店家確認</h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
                  店家已收到預約通知。預約前一小時提醒時間為{" "}
                  {new Intl.DateTimeFormat("zh-TW", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: booking.branch.timezone
                  }).format(new Date(booking.appointment.customerReminderAt))}
                  。
                </p>
                <p className="mt-4 break-all text-xs text-slate-400">預約編號 {booking.id}</p>
                <button
                  className="mt-7 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white"
                  type="button"
                  onClick={startAnotherBooking}
                >
                  建立另一筆預約
                </button>
              </div>
            ) : null}
          </section>

          <aside className="h-fit border border-slate-200 bg-white xl:sticky xl:top-6">
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles aria-hidden="true" className="h-4 w-4 text-coral" />
                預約摘要
              </h2>
            </header>
            <dl className="space-y-4 px-5 py-5 text-sm">
              <div>
                <dt className="text-xs text-slate-500">分店</dt>
                <dd className="mt-1 font-medium text-ink">{selectedBranch?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">服務</dt>
                <dd className="mt-1 font-medium text-ink">{selectedService?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">服務人員</dt>
                <dd className="mt-1 font-medium text-ink">{selectedStaff?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">日期時間</dt>
                <dd className="mt-1 font-medium text-ink">
                  {selectedDate?.label ?? "-"} {form.time}
                </dd>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <dt className="text-xs text-slate-500">預估費用</dt>
                <dd className="mt-1 text-xl font-semibold text-ink">{selectedService ? currency(selectedService.price) : "-"}</dd>
              </div>
            </dl>
            <div className="border-t border-slate-200 px-5 py-4 text-xs leading-5 text-slate-500">
              預約送出後需由店家確認；如需取消或改期，請直接聯繫分店。
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

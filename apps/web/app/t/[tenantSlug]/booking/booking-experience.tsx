"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicBooking, PublicBookingOptions } from "@beauty-saas/shared";

type BookingStep = "service" | "time" | "customer" | "done";

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

const emptyForm: BookingForm = {
  branchId: "",
  serviceId: "",
  staffId: "staff-any",
  date: "",
  time: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  note: ""
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const bookingSteps: Array<{ key: BookingStep; label: string }> = [
  { key: "service", label: "服務" },
  { key: "time", label: "時間" },
  { key: "customer", label: "資料" },
  { key: "done", label: "完成" }
];

function currency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value);
}

function stepState(step: BookingStep, current: BookingStep): "active" | "done" | "idle" {
  const order: BookingStep[] = ["service", "time", "customer", "done"];
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(current);
  if (stepIndex === currentIndex) return "active";
  if (stepIndex < currentIndex) return "done";
  return "idle";
}

export function BookingExperience({ tenantSlug }: { tenantSlug: string }) {
  const [options, setOptions] = useState<PublicBookingOptions | null>(null);
  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [step, setStep] = useState<BookingStep>("service");
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/public/tenants/${tenantSlug}/booking/options`);
        if (!response.ok) {
          throw new Error("無法載入店家訂位資訊。");
        }

        const payload = await response.json();
        const data = payload.data as PublicBookingOptions;

        if (!isMounted) return;
        setOptions(data);
        setForm((current) => ({
          ...current,
          branchId: current.branchId || data.branches[0]?.id || "",
          serviceId: current.serviceId || data.services[0]?.id || "",
          staffId: current.staffId || data.staff[0]?.id || "staff-any",
          date: current.date || data.availableDates[0]?.date || "",
          time: current.time || data.availableDates[0]?.slots[0] || ""
        }));
      } catch (cause) {
        if (!isMounted) return;
        setError(cause instanceof Error ? cause.message : "載入訂位資訊時發生錯誤。");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, [tenantSlug]);

  const selectedBranch = useMemo(() => options?.branches.find((branch) => branch.id === form.branchId), [form.branchId, options]);
  const selectedService = useMemo(() => options?.services.find((service) => service.id === form.serviceId), [form.serviceId, options]);
  const selectedStaff = useMemo(() => options?.staff.find((staff) => staff.id === form.staffId), [form.staffId, options]);
  const selectedDate = useMemo(() => options?.availableDates.find((date) => date.date === form.date), [form.date, options]);

  function updateForm(next: Partial<BookingForm>) {
    setForm((current) => ({ ...current, ...next }));
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

      if (!response.ok) {
        throw new Error("送出預約失敗，請確認資料後再試一次。");
      }

      const payload = await response.json();
      setBooking(payload.data as PublicBooking);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送出預約時發生錯誤。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 sm:px-5">
        <div className="mx-auto max-w-6xl">
          <div className="h-72 animate-pulse rounded-lg bg-white" />
        </div>
      </main>
    );
  }

  if (!options) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mist px-4 sm:px-5">
        <section className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6">
          <p className="text-sm font-semibold text-red-600">訂位頁無法使用</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{error ?? "找不到店家訂位資訊。"}</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mist">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal">{options.tenant.slug}</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl md:text-5xl">{options.tenant.name} 線上訂位</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              選擇分店、服務與可約時段，留下聯絡資訊後即可建立預約。這是本機測試版，方便先確認流程與欄位。
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-mist p-5">
            <p className="text-sm font-medium text-slate-500">預約提醒</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{options.tenant.bookingNotice}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">目前分店</dt>
                <dd className="mt-1 font-medium text-ink">{selectedBranch?.name ?? "未選擇"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">服務時間</dt>
                <dd className="mt-1 font-medium text-ink">{selectedService ? `${selectedService.durationMinutes} 分鐘` : "未選擇"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-5 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <nav className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 xl:block">
          {bookingSteps.map(({ key, label }) => {
            const state = stepState(key, step);
            return (
              <button
                key={key}
                type="button"
                className={`flex min-w-0 w-full flex-col items-center gap-1 rounded-md px-2 py-2 text-center text-sm font-medium sm:flex-row sm:gap-2 sm:text-left xl:mb-2 xl:gap-3 xl:px-3 ${
                  state === "active"
                    ? "bg-teal text-white"
                    : state === "done"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-white text-slate-500"
                }`}
                onClick={() => {
                  if (key !== "done" || booking) setStep(key as BookingStep);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs">{label.slice(0, 1)}</span>
                {label}
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          {step === "service" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-ink">選擇分店與服務</h2>
                <p className="mt-2 text-sm text-slate-600">後續可依據需求改成多服務、套票、訂金或指定資源。</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {options.branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    className={`rounded-lg border p-4 text-left transition ${
                      form.branchId === branch.id ? "border-teal bg-teal/5" : "border-slate-200 bg-white hover:border-teal"
                    }`}
                    onClick={() => updateForm({ branchId: branch.id })}
                  >
                    <span className="font-semibold text-ink">{branch.name}</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">{branch.address}</span>
                    <span className="mt-1 block text-sm text-slate-500">{branch.phone}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {options.services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={`rounded-lg border p-4 text-left transition ${
                      form.serviceId === service.id ? "border-coral bg-red-50" : "border-slate-200 bg-white hover:border-coral"
                    }`}
                    onClick={() => updateForm({ serviceId: service.id })}
                  >
                    <span className="text-xs font-semibold text-coral">{service.category}</span>
                    <span className="mt-1 block text-lg font-semibold text-ink">{service.name}</span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">{service.description}</span>
                    <span className="mt-3 flex justify-between text-sm font-medium text-slate-700">
                      <span>{service.durationMinutes} 分鐘</span>
                      <span>{currency(service.price)}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <button className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white" type="button" onClick={() => setStep("time")}>
                  下一步
                </button>
              </div>
            </div>
          ) : null}

          {step === "time" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-ink">選擇服務人員與時間</h2>
                <p className="mt-2 text-sm text-slate-600">目前時段為本機測試資料，後續會接排班、休假與衝突檢查。</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {options.staff.map((staff) => (
                  <button
                    key={staff.id}
                    type="button"
                    className={`rounded-lg border p-4 text-left ${
                      form.staffId === staff.id ? "border-teal bg-teal/5" : "border-slate-200 bg-white hover:border-teal"
                    }`}
                    onClick={() => updateForm({ staffId: staff.id })}
                  >
                    <span className="font-semibold text-ink">{staff.name}</span>
                    <span className="mt-1 block text-sm text-slate-600">{staff.title}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {options.availableDates.map((date) => (
                  <button
                    key={date.date}
                    type="button"
                    className={`rounded-lg border px-4 py-3 text-left ${
                      form.date === date.date ? "border-gold bg-amber-50" : "border-slate-200 bg-white hover:border-gold"
                    }`}
                    onClick={() => updateForm({ date: date.date, time: date.slots[0] ?? "" })}
                  >
                    <span className="font-semibold text-ink">{date.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{date.slots.length} 個可約時段</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(selectedDate?.slots ?? []).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`rounded-md border px-4 py-3 text-sm font-semibold ${
                      form.time === slot ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-ink hover:border-ink"
                    }`}
                    onClick={() => updateForm({ time: slot })}
                  >
                    {slot}
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <button className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700" type="button" onClick={() => setStep("service")}>
                  上一步
                </button>
                <button className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white" type="button" onClick={() => setStep("customer")}>
                  下一步
                </button>
              </div>
            </div>
          ) : null}

          {step === "customer" ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void submitBooking();
              }}
            >
              <div>
                <h2 className="text-2xl font-semibold text-ink">填寫聯絡資料</h2>
                <p className="mt-2 text-sm text-slate-600">店家會依此資訊確認預約。</p>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">姓名</span>
                <input
                  required
                  className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 text-ink outline-none focus:border-teal"
                  value={form.customerName}
                  onChange={(event) => updateForm({ customerName: event.target.value })}
                  placeholder="例如：王小美"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">手機</span>
                <input
                  required
                  className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 text-ink outline-none focus:border-teal"
                  value={form.customerPhone}
                  onChange={(event) => updateForm({ customerPhone: event.target.value })}
                  placeholder="例如：0912-345-678"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 text-ink outline-none focus:border-teal"
                  type="email"
                  value={form.customerEmail}
                  onChange={(event) => updateForm({ customerEmail: event.target.value })}
                  placeholder="可選填"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">備註</span>
                <textarea
                  className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-4 py-3 text-ink outline-none focus:border-teal"
                  value={form.note}
                  onChange={(event) => updateForm({ note: event.target.value })}
                  placeholder="例如：容易敏感、需要停車資訊、想先諮詢款式"
                />
              </label>

              <div className="flex justify-between">
                <button className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700" type="button" onClick={() => setStep("time")}>
                  上一步
                </button>
                <button className="rounded-md bg-coral px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "送出中" : "送出預約"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "done" && booking ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-emerald-700">預約已建立</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">等待店家確認</h2>
                <p className="mt-2 break-all text-sm leading-6 text-slate-700">預約編號：{booking.id}</p>
              </div>
              <button
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white"
                type="button"
                onClick={() => {
                  setBooking(null);
                  setForm(emptyForm);
                  setStep("service");
                }}
              >
                建立另一筆預約
              </button>
            </div>
          ) : null}
        </section>

        <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-ink">預約摘要</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">分店</dt>
              <dd className="mt-1 font-medium text-ink">{selectedBranch?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">服務</dt>
              <dd className="mt-1 font-medium text-ink">{selectedService?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">服務人員</dt>
              <dd className="mt-1 font-medium text-ink">{selectedStaff?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">日期時間</dt>
              <dd className="mt-1 font-medium text-ink">
                {selectedDate?.label ?? "-"} {form.time}
              </dd>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <dt className="text-slate-500">預估費用</dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">{selectedService ? currency(selectedService.price) : "-"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

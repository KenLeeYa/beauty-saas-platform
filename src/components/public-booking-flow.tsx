"use client";

import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  RotateCcw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  MonthCalendar,
  type MonthCalendarDay,
} from "@/components/month-calendar";
import { TurnstileWidget } from "@/components/turnstile-widget";
import type { PublicAvailability } from "@/server/public-booking/availability";
import type { PublicCatalog } from "@/server/public-booking/catalog";
import type { BookingHoldResult } from "@/server/public-booking/hold";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type SessionResponse = {
  token: string;
  expiresAt: string;
};

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "系統暫時無法處理。");
  }
  return payload.data;
}

export function PublicBookingFlow({
  catalog,
  calendarDays,
  initialDate,
  turnstileSiteKey,
  localTurnstileBypass,
  rescheduleTrackingToken,
  lockedVariantId,
}: {
  catalog: PublicCatalog;
  calendarDays: MonthCalendarDay[];
  initialDate: string;
  turnstileSiteKey: string;
  localTurnstileBypass: boolean;
  rescheduleTrackingToken?: string;
  lockedVariantId?: string;
}) {
  const router = useRouter();
  const variants = useMemo(
    () =>
      catalog.services.flatMap((service) =>
        service.variants.map((variant) => ({
          ...variant,
          serviceId: service.id,
          serviceName: service.name,
          description: service.description,
          bookingNotice: service.bookingNotice,
          categoryName: service.categoryName,
        })),
      ),
    [catalog.services],
  );
  const initialVariant =
    variants.find((variant) => variant.id === lockedVariantId) ??
    variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialVariant?.id ?? "",
  );
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [availability, setAvailability] =
    useState<PublicAvailability | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    localTurnstileBypass ? "local-test" : null,
  );
  const [deviceId] = useState(() =>
    typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : `device-${Date.now()}`,
  );
  const [hold, setHold] = useState<BookingHoldResult | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [serviceConsent, setServiceConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    "請先選擇服務與日期。",
  );

  const selectedVariant = variants.find(
    (variant) => variant.id === selectedVariantId,
  );

  async function ensureSession(): Promise<string> {
    if (sessionToken) {
      return sessionToken;
    }
    if (!turnstileToken) {
      throw new Error("請先完成安全驗證。");
    }

    const response = await fetch("/api/public/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        organizationSlug: catalog.organization.slug,
        locationSlug: catalog.location.slug,
        turnstileToken,
        deviceId,
      }),
    });
    const session = await parseResponse<SessionResponse>(response);
    setSessionToken(session.token);
    return session.token;
  }

  async function loadAvailability(date: string): Promise<void> {
    if (!selectedVariant) {
      return;
    }
    setIsLoading(true);
    setError(null);
    setHold(null);

    try {
      const token = await ensureSession();
      const response = await fetch("/api/public/availability", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-booking-session": token,
        },
        body: JSON.stringify({
          serviceVariantId: selectedVariant.id,
          date,
          ...(selectedStaffId
            ? { staffProfileId: selectedStaffId }
            : {}),
        }),
      });
      const result = await parseResponse<PublicAvailability>(response);
      setAvailability(result);
      setAnnouncement(
        result.slots.length > 0
          ? `${date} 有 ${result.slots.length} 個可預約時段。`
          : `${date} 目前沒有可預約時段。`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "時段查詢失敗。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function reserveSlot(input: {
    startsAt: string;
    staffProfileId: string;
  }): Promise<void> {
    if (!sessionToken || !selectedVariant) {
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/public/holds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-booking-session": sessionToken,
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          serviceVariantId: selectedVariant.id,
          staffProfileId: input.staffProfileId,
          startsAt: input.startsAt,
        }),
      });
      const result = await parseResponse<BookingHoldResult>(response);
      setHold(result);
      setAnnouncement(
        `已保留 ${result.selection.startsAt}，請完成預約資料。`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "時段保留失敗。",
      );
      await loadAvailability(selectedDate);
    } finally {
      setIsLoading(false);
    }
  }

  async function completeBooking(): Promise<void> {
    if (!sessionToken || !hold) {
      return;
    }
    if (!rescheduleTrackingToken && !serviceConsent) {
      setError("請確認服務同意事項。");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isReschedule = Boolean(rescheduleTrackingToken);
      const response = await fetch(
        isReschedule
          ? "/api/public/bookings/reschedule"
          : "/api/public/bookings/confirm",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-booking-session": sessionToken,
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify(
            isReschedule
              ? {
                  trackingToken: rescheduleTrackingToken,
                  holdToken: hold.holdToken,
                }
              : {
                  holdToken: hold.holdToken,
                  customer: {
                    displayName,
                    phone,
                    email,
                    note,
                  },
                  consents: {
                    service: serviceConsent,
                    marketing: marketingConsent,
                  },
                },
          ),
        },
      );
      const result = await parseResponse<{
        trackingToken: string;
      }>(response);
      router.push(`/booking/${encodeURIComponent(result.trackingToken)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "預約確認失敗。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">
              {catalog.organization.name}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              {catalog.location.name}
            </p>
          </div>
          <Link
            className="text-sm font-medium text-teal hover:underline"
            href="/"
          >
            店家登入
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-10"
      >
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="service-heading">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-coral/10 text-coral">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-coral">
                  步驟 1
                </p>
                <h1
                  id="service-heading"
                  className="text-xl font-semibold text-ink sm:text-2xl"
                >
                  {rescheduleTrackingToken
                    ? "選擇新的預約日期"
                    : "選擇服務"}
                </h1>
              </div>
            </div>

            {!rescheduleTrackingToken ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {variants.map((variant) => {
                  const selected = variant.id === selectedVariantId;
                  return (
                    <button
                      key={variant.id}
                      className={`min-h-36 rounded-md border p-4 text-left transition ${
                        selected
                          ? "border-teal bg-teal/5 ring-2 ring-teal/15"
                          : "border-slate-200 bg-white hover:border-teal/60"
                      }`}
                      type="button"
                      onClick={() => {
                        setSelectedVariantId(variant.id);
                        setSelectedStaffId("");
                        setAvailability(null);
                        setHold(null);
                      }}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block text-base font-semibold text-ink">
                            {variant.serviceName}
                          </span>
                          <span className="mt-1 block text-sm text-slate-500">
                            {variant.name} · {variant.durationMinutes} 分鐘
                          </span>
                        </span>
                        {selected ? (
                          <Check
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-teal"
                          />
                        ) : null}
                      </span>
                      <span className="mt-4 block text-sm leading-6 text-slate-600">
                        {variant.description}
                      </span>
                      <span className="mt-3 block text-base font-semibold text-ink">
                        {formatMoney(
                          variant.priceMinor,
                          catalog.location.currency,
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 border-l-4 border-teal bg-white px-4 py-4">
                <p className="font-semibold text-ink">
                  {selectedVariant?.serviceName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedVariant?.name} ·{" "}
                  {selectedVariant?.durationMinutes} 分鐘
                </p>
              </div>
            )}
          </section>

          {selectedVariant ? (
            <section aria-labelledby="staff-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
                  <UserRound aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-gold">
                    步驟 2
                  </p>
                  <h2
                    id="staff-heading"
                    className="text-xl font-semibold text-ink"
                  >
                    選擇服務人員
                  </h2>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                    !selectedStaffId
                      ? "border-ink bg-ink text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                  type="button"
                  onClick={() => {
                    setSelectedStaffId("");
                    setAvailability(null);
                    setHold(null);
                  }}
                >
                  由系統安排
                </button>
                {selectedVariant.staff.map((staff) => (
                  <button
                    key={staff.id}
                    className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                      selectedStaffId === staff.id
                        ? "border-ink bg-ink text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                    type="button"
                    onClick={() => {
                      setSelectedStaffId(staff.id);
                      setAvailability(null);
                      setHold(null);
                    }}
                  >
                    {staff.displayName}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {selectedVariant ? (
            <section aria-labelledby="date-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal/10 text-teal">
                  <CalendarDays aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-teal">
                    步驟 3
                  </p>
                  <h2
                    id="date-heading"
                    className="text-xl font-semibold text-ink"
                  >
                    選擇日期與時間
                  </h2>
                </div>
              </div>

              {!sessionToken && !localTurnstileBypass ? (
                <div className="mt-5 border-y border-slate-200 bg-white py-5">
                  {turnstileSiteKey ? (
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      onToken={setTurnstileToken}
                    />
                  ) : (
                    <p role="alert" className="text-sm text-red-700">
                      預約安全驗證尚未設定。
                    </p>
                  )}
                </div>
              ) : null}

              <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white">
                <MonthCalendar
                  audience="customer"
                  days={calendarDays}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setAvailability(null);
                    setHold(null);
                    void loadAvailability(date);
                  }}
                />
              </div>

              <div className="mt-5 min-h-24">
                {isLoading && !hold ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <RotateCcw
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                    正在確認即時時段...
                  </p>
                ) : availability && availability.slots.length > 0 ? (
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">
                      {selectedDate} 可預約時段
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {availability.slots.map((slot) => (
                        <button
                          key={slot.startsAt}
                          className="flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold text-ink transition hover:border-teal hover:text-teal disabled:opacity-50"
                          disabled={isLoading}
                          type="button"
                          onClick={() =>
                            void reserveSlot({
                              startsAt: slot.startsAt,
                              staffProfileId:
                                selectedStaffId ||
                                slot.availableStaff[0] ||
                                "",
                            })
                          }
                        >
                          {slot.localTime}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : availability ? (
                  <p className="text-sm text-slate-500">
                    當日已額滿或暫停預約，請選擇其他日期。
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    點選月曆日期後，才會載入可預約時段。
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {hold ? (
            <section aria-labelledby="details-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white">
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    步驟 4
                  </p>
                  <h2
                    id="details-heading"
                    className="text-xl font-semibold text-ink"
                  >
                    {rescheduleTrackingToken
                      ? "確認改期"
                      : "填寫預約資料"}
                  </h2>
                </div>
              </div>

              {!rescheduleTrackingToken ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      姓名
                    </span>
                    <input
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 outline-none focus:border-teal"
                      maxLength={120}
                      required
                      value={displayName}
                      onChange={(event) =>
                        setDisplayName(event.target.value)
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      手機
                    </span>
                    <input
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 outline-none focus:border-teal"
                      inputMode="tel"
                      maxLength={32}
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      Email（選填）
                    </span>
                    <input
                      className="mt-2 h-12 w-full rounded-md border border-slate-300 bg-white px-4 outline-none focus:border-teal"
                      inputMode="email"
                      maxLength={254}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      備註（選填）
                    </span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-md border border-slate-300 bg-white p-4 outline-none focus:border-teal"
                      maxLength={1000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <label className="flex items-start gap-3 sm:col-span-2">
                    <input
                      checked={serviceConsent}
                      className="mt-1 h-4 w-4 accent-teal"
                      type="checkbox"
                      onChange={(event) =>
                        setServiceConsent(event.target.checked)
                      }
                    />
                    <span className="text-sm leading-6 text-slate-600">
                      我確認服務內容與取消規則，並同意店家為完成本次服務使用上述聯絡資料。
                    </span>
                  </label>
                  <label className="flex items-start gap-3 sm:col-span-2">
                    <input
                      checked={marketingConsent}
                      className="mt-1 h-4 w-4 accent-teal"
                      type="checkbox"
                      onChange={(event) =>
                        setMarketingConsent(event.target.checked)
                      }
                    />
                    <span className="text-sm leading-6 text-slate-600">
                      我願意接收店家活動與回訪通知（選填）。
                    </span>
                  </label>
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  新時段確認後，原預約會標記為已改期，新的安全查詢連結會立即產生。
                </p>
              )}

              <button
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
                disabled={
                  isLoading ||
                  (!rescheduleTrackingToken &&
                    (!displayName.trim() ||
                      !phone.trim() ||
                      !serviceConsent))
                }
                type="button"
                onClick={() => void completeBooking()}
              >
                <Check aria-hidden="true" className="h-4 w-4" />
                {isLoading
                  ? "處理中..."
                  : rescheduleTrackingToken
                    ? "確認改期"
                    : "送出預約"}
              </button>
            </section>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="border-t-4 border-teal bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink">預約摘要</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">服務</dt>
                <dd className="mt-1 font-medium text-ink">
                  {selectedVariant
                    ? `${selectedVariant.serviceName} · ${selectedVariant.name}`
                    : "尚未選擇"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">分店</dt>
                <dd className="mt-1 font-medium text-ink">
                  {catalog.location.name}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">日期時間</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium text-ink">
                  <Clock3
                    aria-hidden="true"
                    className="h-4 w-4 text-teal"
                  />
                  {hold
                    ? `${selectedDate} ${new Date(
                        hold.selection.startsAt,
                      ).toLocaleTimeString("zh-TW", {
                        timeZone: catalog.location.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}`
                    : "尚未選擇"}
                </dd>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <dt className="text-slate-500">金額</dt>
                <dd className="mt-1 text-xl font-semibold text-ink">
                  {selectedVariant
                    ? formatMoney(
                        selectedVariant.priceMinor,
                        catalog.location.currency,
                      )
                    : "-"}
                </dd>
                {selectedVariant?.depositMinor ? (
                  <p className="mt-1 text-xs text-coral">
                    需支付訂金{" "}
                    {formatMoney(
                      selectedVariant.depositMinor,
                      catalog.location.currency,
                    )}
                  </p>
                ) : null}
              </div>
            </dl>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            時段會短暫保留，正式送出前仍會由系統再次確認人員與空間。
          </p>
        </aside>
      </main>
    </div>
  );
}

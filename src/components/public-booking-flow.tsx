"use client";

import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { requestId } from "@/lib/line-booking/request-id";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  MonthCalendar,
  type MonthCalendarDay,
} from "@/components/month-calendar";
import { LogoutButton } from "@/components/logout-button";
import { BookingServicePicker } from "@/components/booking-service-picker";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatLocalTime } from "@/lib/presentation/date-time";
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

type ReleaseHoldResponse = {
  released: boolean;
};

function formatMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

type VariantCancellationPolicy =
  PublicCatalog["services"][number]["variants"][number]["cancellationPolicy"];

function formatLateCancellationRule(
  policy: VariantCancellationPolicy,
  currency: string,
  locale: string,
  t: (key: string) => string,
): string {
  switch (policy.lateFeeMode) {
    case "FIXED":
      return `${t("逾期取消費")} ${formatMoney(policy.lateFeeFixedMinor ?? 0, currency, locale)}`;
    case "PERCENTAGE":
      return `${t("逾期取消費為服務金額的")} ${policy.lateFeePercentage ?? 0}%`;
    case "DEPOSIT_FORFEIT":
      return t("逾期取消將依規則扣留已付訂金");
    default:
      return t("逾期取消不另收取消費");
  }
}

function publicMediaLoader({ src }: ImageLoaderProps): string {
  return src;
}

function formatVariantMeta(name: string, durationMinutes: number, t: (key: string) => string): string {
  const duration = `${durationMinutes} ${t("分鐘")}`;
  return name.trim() === `${durationMinutes} 分鐘` ? duration : `${name} · ${duration}`;
}

class PublicBookingRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.data) {
    throw new PublicBookingRequestError(payload.error?.message ?? "系統暫時無法處理。", response.status);
  }
  return payload.data;
}

export function PublicBookingFlow({
  authenticated,
  catalog,
  calendarDays,
  initialDate,
  turnstileSiteKey,
  localTurnstileBypass,
  rescheduleTrackingToken,
  lockedVariantId,
}: {
  authenticated: boolean;
  catalog: PublicCatalog;
  calendarDays: MonthCalendarDay[];
  initialDate: string;
  turnstileSiteKey: string;
  localTurnstileBypass: boolean;
  rescheduleTrackingToken?: string;
  lockedVariantId?: string;
}) {
  const { locale, t, errorText } = useLanguage();
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
          imageUrl: service.imageUrl,
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
  const [step, setStep] = useState(rescheduleTrackingToken ? 3 : 1);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [pendingTime, setPendingTime] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLElement | null>(null);
  const availabilityController = useRef<AbortController | null>(null);
  const previousStep = useRef(step);
  const [availability, setAvailability] =
    useState<PublicAvailability | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    localTurnstileBypass ? "local-test" : null,
  );
  const [deviceId] = useState(() =>
    typeof crypto !== "undefined"
      ? requestId()
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
  const announcement = hold ? t("填寫預約資料") : availability
    ? `${selectedDate} · ${t("可預約時段")} ${availability.slots.length}`
    : t("請先選擇服務與日期。");

  const selectedVariant = variants.find(
    (variant) => variant.id === selectedVariantId,
  );

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = flowRef.current?.querySelector<HTMLElement>('section:not([hidden]) [data-step-heading]');
    heading?.focus({preventScroll: true});
    flowRef.current?.scrollIntoView({block: 'start'});
  }, [step]);

  useEffect(() => () => availabilityController.current?.abort(), []);

  function closeTimeDialog() {
    if (isReserving) return;
    availabilityController.current?.abort();
    setIsLoading(false);
    setTimeDialogOpen(false);
  }

  function recoverExpiredSession(cause: unknown): boolean {
    if (!(cause instanceof PublicBookingRequestError) || cause.status !== 401) return false;
    // A rejected session needs a fresh challenge; retain contact and service drafts.
    setSessionToken(null);
    setTurnstileToken(localTurnstileBypass ? "local-test" : null);
    setHold(null);
    setPendingTime(null);
    setAvailability(null);
    setTimeDialogOpen(false);
    setStep(3);
    return true;
  }

  async function ensureSession(signal: AbortSignal): Promise<string> {
    if (sessionToken) {
      return sessionToken;
    }
    if (!turnstileToken) {
      throw new Error(t("請先完成安全驗證。"));
    }

    const response = await fetch("/api/public/session", {
      signal,
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
    availabilityController.current?.abort();
    const controller = new AbortController();
    availabilityController.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);

    try {
      const token = await ensureSession(signal);
      const response = await fetch("/api/public/availability", {
        signal,
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
      if (controller.signal.aborted) return;
      setAvailability(result);
      setPendingTime(current => result.slots.some(slot => slot.startsAt === current) ? current : null);
    } catch (cause) {
      if (controller.signal.aborted) return;
      recoverExpiredSession(cause);
      setAvailability(null);
      setError(
        signal.aborted ? "時段查詢失敗。" : cause instanceof Error ? cause.message : "時段查詢失敗。",
      );
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
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
    setIsReserving(true);
    setError(null);

    try {
      const response = await fetch("/api/public/holds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-booking-session": sessionToken,
          "idempotency-key": requestId(),
        },
        body: JSON.stringify({
          serviceVariantId: selectedVariant.id,
          staffProfileId: input.staffProfileId,
          startsAt: input.startsAt,
        }),
      });
      const result = await parseResponse<BookingHoldResult>(response);
      setHold(result);
      setTimeDialogOpen(false);
      setStep(4);
    } catch (cause) {
      if (!recoverExpiredSession(cause)) await loadAvailability(selectedDate);
      setError(
        cause instanceof Error ? cause.message : "時段保留失敗。",
      );
    } finally {
      setIsLoading(false);
      setIsReserving(false);
    }
  }

  async function releaseCurrentHold(): Promise<boolean> {
    const currentHold = hold;
    if (!currentHold || !sessionToken) {
      return true;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/public/holds", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-booking-session": sessionToken,
        },
        body: JSON.stringify({
          holdToken: currentHold.holdToken,
        }),
      });
      await parseResponse<ReleaseHoldResponse>(response);
      setHold((activeHold) =>
        activeHold?.holdToken === currentHold.holdToken
          ? null
          : activeHold,
      );
      return true;
    } catch (cause) {
      recoverExpiredSession(cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "無法釋放目前保留時段，請稍後再試。",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function selectVariant(variantId: string): Promise<void> {
    if (variantId === selectedVariantId) {
      return;
    }
    if (!(await releaseCurrentHold())) {
      return;
    }

    setSelectedVariantId(variantId);
    setSelectedStaffId("");
    setAvailability(null);
  }

  async function selectStaff(staffProfileId: string): Promise<void> {
    if (staffProfileId === selectedStaffId) {
      return;
    }
    if (!(await releaseCurrentHold())) {
      return;
    }

    setSelectedStaffId(staffProfileId);
    setAvailability(null);
  }

  async function selectDate(date: string): Promise<void> {
    if (isLoading) return;
    dateTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (date === selectedDate) {
      setPendingTime(hold?.selection.startsAt ?? null);
      setTimeDialogOpen(true);
      await loadAvailability(date);
      return;
    }
    if (!(await releaseCurrentHold())) {
      return;
    }

    setSelectedDate(date);
    setAvailability(null);
    setPendingTime(null);
    setTimeDialogOpen(true);
    await loadAvailability(date);
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
            "idempotency-key": requestId(),
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
      recoverExpiredSession(cause);
      setError(
        cause instanceof Error ? cause.message : "預約確認失敗。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="booking-surface min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {catalog.organization.logoUrl ? (
              <Image
                alt={`${catalog.organization.name} Logo`}
                className="h-11 w-11 shrink-0 rounded-md object-cover"
                height={44}
                loader={publicMediaLoader}
                src={catalog.organization.logoUrl}
                unoptimized
                width={44}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">
                {catalog.organization.name}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={catalog.location.name}>{catalog.location.name}</span>
              </p>
            </div>
          </div>
          {authenticated ? (
            <LogoutButton />
          ) : (<div className="flex shrink-0 items-center gap-2"><LanguageSwitcher />
            <Link
              className="utility-icon" aria-label={t("帳號登入")} title={t("帳號登入")}
              href="/"
            >
              <LogIn size={20} aria-hidden="true" /></Link></div>
          )}
        </div>
      </header>

      {step === 1 && (catalog.location.coverImageUrl ||
      catalog.organization.coverImageUrl) ? (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl sm:px-6">
            <Image
              alt={`${catalog.location.name} ${t("店面")}`}
              className="aspect-[21/7] w-full object-cover sm:rounded-b-md"
              height={400}
              loader={publicMediaLoader}
              src={
                catalog.location.coverImageUrl ??
                catalog.organization.coverImageUrl ??
                ""
              }
              unoptimized
              width={1200}
            />
            {catalog.location.description || catalog.organization.description ? (
              <p className="px-4 py-4 text-sm leading-6 text-slate-600 sm:px-0">
                {catalog.location.description || catalog.organization.description}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <main
        id="main-content"
        className="mx-auto grid max-w-6xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:py-10"
      >
        <div ref={flowRef} className="min-w-0 space-y-5 scroll-mt-4">
          <ol aria-label={t("預約步驟")} className="grid grid-flow-col auto-cols-fr gap-2 text-xs">
            {(rescheduleTrackingToken ? [3, 4] : [1, 2, 3, 4]).map(number => (
              <li key={number} aria-current={step === number ? 'step' : undefined} className={`min-w-0 border-t-2 pt-2 ${step === number ? 'border-teal font-semibold text-teal' : 'border-slate-200 text-slate-500'}`}>
                <span className="mr-1 tabular-nums">{rescheduleTrackingToken ? number - 2 : number}.</span>
                {number === 1 ? t("服務") : number === 2 ? t("服務人員") : number === 3 ? t("日期與時間") : rescheduleTrackingToken ? t("確認改期") : t("填寫資料")}
              </li>
            ))}
          </ol>
          {step > (rescheduleTrackingToken ? 3 : 1) ? (
            <button type="button" disabled={isLoading} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-slate-600 disabled:opacity-50" onClick={() => setStep(step - 1)}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />{t("上一步")}
            </button>
          ) : null}
          <section hidden={step !== 1} aria-labelledby="service-heading">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-coral/10 text-coral">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-coral">
                  {t("步驟 1")}</p>
                <h1
                  id="service-heading"
                  data-step-heading tabIndex={-1}
                  className="text-xl font-semibold text-ink sm:text-2xl"
                >
                  {rescheduleTrackingToken
                    ? t("選擇新的預約日期")
                    : t("選擇服務")}
                </h1>
              </div>
            </div>

            {!rescheduleTrackingToken ? (
              <BookingServicePicker variants={variants} selectedId={selectedVariantId}
                currency={catalog.location.currency} disabled={isLoading}
                onSelect={id => void selectVariant(id)} />
            ) : (
              <div className="mt-5 border-l-4 border-teal bg-white px-4 py-4">
                <p className="font-semibold text-ink">
                  {selectedVariant?.serviceName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedVariant
                    ? formatVariantMeta(
                        selectedVariant.name,
                        selectedVariant.durationMinutes,
                        t,
                      )
                    : ""}
                </p>
              </div>
            )}
          </section>

          {selectedVariant ? (
            <section hidden={step !== 2} aria-labelledby="staff-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/10 text-gold">
                  <UserRound aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-gold">
                    {t("步驟 2")}</p>
                  <h1
                    id="staff-heading"
                    data-step-heading tabIndex={-1}
                    className="text-xl font-semibold text-ink"
                  >
                    {t("選擇服務人員")}</h1>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                    !selectedStaffId
                      ? "border-ink bg-ink text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                  disabled={isLoading || selectedVariant.staff.length === 0}
                  type="button"
                  onClick={() => void selectStaff("")}
                  aria-pressed={!selectedStaffId}
                >
                  {t("由系統安排")}</button>
                {selectedVariant.staff.map((staff) => (
                  <button
                    key={staff.id}
                    aria-pressed={selectedStaffId === staff.id}
                    className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium ${
                      selectedStaffId === staff.id
                        ? "border-ink bg-ink text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                    disabled={isLoading}
                    type="button"
                    onClick={() => void selectStaff(staff.id)}
                  >
                    {staff.photoUrl ? (
                      <Image
                        alt=""
                        className="h-8 w-8 rounded-md object-cover"
                        height={32}
                        loader={publicMediaLoader}
                        src={staff.photoUrl}
                        unoptimized
                        width={32}
                      />
                    ) : null}
                    {staff.displayName}
                  </button>
                ))}
              </div>
              {selectedVariant.staff.length === 0 && <p role="status" className="mt-4 text-sm text-slate-600">{t("暫無符合資格的人員")}</p>}
            </section>
          ) : null}

          {selectedVariant ? (
            <section hidden={step !== 3} aria-labelledby="date-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal/10 text-teal">
                  <CalendarDays aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-teal">
                    {rescheduleTrackingToken ? t("步驟 1") : t("步驟 3")}</p>
                  <h1
                    id="date-heading"
                    data-step-heading tabIndex={-1}
                    className="text-xl font-semibold text-ink"
                  >
                    {rescheduleTrackingToken ? t("選擇新的預約日期") : t("選擇日期與時間")}</h1>
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
                      {t("預約安全驗證尚未設定。")}</p>
                  )}
                </div>
              ) : null}

              <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white">
                <MonthCalendar
                  audience="customer"
                  days={calendarDays}
                  selectedDate={selectedDate}
                  onSelectDate={(date) => void selectDate(date)}
                />
              </div>

              <Dialog open={timeDialogOpen} onOpenChange={open => {if (!open) closeTimeDialog();}}>
                <DialogContent showCloseButton={false}
                  className="booking-time-dialog top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-lg rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
                  onCloseAutoFocus={event => {
                    event.preventDefault();
                    if (step === 4) document.getElementById('details-heading')?.focus();
                    else dateTriggerRef.current?.focus({preventScroll: true});
                  }}>
                  <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 p-4">
                    <div className="min-w-0">
                      <DialogTitle className="text-lg font-semibold text-ink">{t("選擇時間")}</DialogTitle>
                      <DialogDescription className="mt-2 text-sm text-slate-600">
                        {new Intl.DateTimeFormat(locale, {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(new Date(`${selectedDate}T12:00:00Z`))}
                      </DialogDescription>
                    </div>
                    <div className="flex shrink-0"><LanguageSwitcher /><button type="button" className="utility-icon" title={t("關閉")} aria-label={t("關閉")} disabled={isReserving} onClick={closeTimeDialog}><X aria-hidden="true" className="h-5 w-5" /></button></div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" aria-busy={isLoading}>
                    <p className="mb-4 text-sm text-slate-600">{selectedVariant.serviceName} · {selectedVariant.durationMinutes} {t("分鐘")}</p>
                {error ? (
                  <div role="alert" className="mb-3 text-sm text-red-700">
                    <p>{errorText(error)}</p>
                    <button type="button" disabled={isLoading} className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold" onClick={() => void loadAvailability(selectedDate)}>
                      <RotateCcw aria-hidden="true" className="h-4 w-4" />{t("重試")}
                    </button>
                  </div>
                ) : null}
                {isLoading ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <RotateCcw
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                    {t("正在確認即時時段...")}</p>
                ) : availability && availability.slots.length > 0 ? (
                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-700">
                      {t("可預約時段")} · {availability.slots.length}</p>
                    <div role="group" aria-label={t("可預約時段")} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {availability.slots.map((slot) => {
                        const selected =
                          pendingTime === slot.startsAt;
                        return (
                          <button
                            key={slot.startsAt}
                            aria-pressed={selected}
                            className={`flex h-11 items-center justify-center rounded-md border text-sm font-semibold transition disabled:opacity-50 ${
                              selected
                                ? "border-ink bg-ink text-white"
                                : "border-slate-300 bg-white text-ink hover:border-teal hover:text-teal"
                            }`}
                            disabled={isLoading}
                            type="button"
                            onClick={() => setPendingTime(slot.startsAt)}
                          >
                            {slot.localTime}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : availability ? (
                  <p className="text-sm text-slate-500">
                    {t("當日已額滿或暫停預約，請選擇其他日期。")}</p>
                ) : (
                  <p className="text-sm text-slate-500">
                    {t("點選月曆日期後，才會載入可預約時段。")}</p>
                )}
                  </div>
                  <div className="booking-time-actions shrink-0 border-t border-slate-200 bg-white p-4">
                    <p className="mb-3 text-sm font-semibold text-ink" aria-live="polite">{pendingTime ? `${selectedDate} · ${formatLocalTime(pendingTime, catalog.location.timezone)}` : t("尚未選擇")}</p>
                    <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={isLoading || !pendingTime || !availability?.slots.some(slot => slot.startsAt === pendingTime)} onClick={() => {
                      const slot = availability?.slots.find(item => item.startsAt === pendingTime);
                      if (slot) void reserveSlot({startsAt: slot.startsAt, staffProfileId: selectedStaffId || slot.availableStaff[0] || ''});
                    }}><Check aria-hidden="true" className="h-4 w-4" />{isReserving ? t("處理中...") : t("確認時間")}</button>
                  </div>
                </DialogContent>
              </Dialog>
            </section>
          ) : null}

          {hold ? (
            <section hidden={step !== 4} aria-labelledby="details-heading">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white">
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    {rescheduleTrackingToken ? t("步驟 2") : t("步驟 4")}</p>
                  <h1
                    id="details-heading"
                    data-step-heading tabIndex={-1}
                    className="text-xl font-semibold text-ink"
                  >
                    {rescheduleTrackingToken
                      ? t("確認改期")
                      : t("填寫預約資料")}
                  </h1>
                </div>
              </div>

              {!rescheduleTrackingToken ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      {t("姓名")}</span>
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
                      {t("手機")}</span>
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
                      {t("Email（選填）")}</span>
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
                      {t("備註（選填）")}</span>
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
                      {t("我確認服務內容與取消規則，並同意店家為完成本次服務使用上述聯絡資料。")}</span>
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
                      {t("我願意接收店家活動與回訪通知（選填）。")}</span>
                  </label>
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {t("新時段確認後，原預約會標記為已改期，新的安全查詢連結會立即產生。")}</p>
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
                  ? t("處理中...")
                  : rescheduleTrackingToken
                    ? t("確認改期")
                    : t("送出預約")}
              </button>
            </section>
          ) : null}

          {step < 4 && selectedVariant ? (
            <div className={`${step === 1 ? "" : "sticky bottom-0"} border-t border-slate-200 bg-mist py-4 pb-[max(16px,env(safe-area-inset-bottom))]`}>
              <p className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{selectedVariant.serviceName}</span><strong className="text-ink">{formatMoney(selectedVariant.priceMinor, catalog.location.currency, locale)}</strong></p>
              {step < 3 || hold ? (
                <button type="button" disabled={isLoading || (step === 2 && (!selectedVariant.staff.length || Boolean(selectedStaffId && !selectedVariant.staff.some(staff=>staff.id===selectedStaffId))))} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => setStep(step + 1)}>
                  {t("下一步")}<ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
          {error && !timeDialogOpen ? (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorText(error)}
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>

        <aside className={`${step === 4 ? '' : 'hidden lg:block'} lg:sticky lg:top-6 lg:self-start`}>
          <div className="border-t-4 border-teal bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink">{t("預約摘要")}</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-slate-500">{t("服務")}</dt>
                <dd className="mt-1 font-medium text-ink">
                  {selectedVariant
                    ? `${selectedVariant.serviceName} · ${selectedVariant.name}`
                    : t("尚未選擇")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("分店")}</dt>
                <dd className="mt-1 font-medium text-ink">
                  {catalog.location.name}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("日期時間")}</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium text-ink">
                  <Clock3
                    aria-hidden="true"
                    className="h-4 w-4 text-teal"
                  />
                  {hold
                    ? `${selectedDate} ${formatLocalTime(
                        hold.selection.startsAt,
                        catalog.location.timezone,
                      )}`
                    : t("尚未選擇")}
                </dd>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <dt className="text-slate-500">{t("金額")}</dt>
                <dd className="mt-1 text-xl font-semibold text-ink">
                  {selectedVariant
                    ? formatMoney(
                        selectedVariant.priceMinor,
                        catalog.location.currency,
                        locale,
                      )
                    : "-"}
                </dd>
                {selectedVariant?.depositMinor ? (
                  <p className="mt-1 text-xs text-coral">
                    {t("需支付訂金")}{" "}
                    {formatMoney(
                      selectedVariant.depositMinor,
                      catalog.location.currency,
                      locale,
                    )}
                  </p>
                ) : null}
              </div>
            </dl>
            {selectedVariant ? (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ShieldCheck
                    aria-hidden="true"
                    className="h-4 w-4 text-teal"
                  />
                  {t("預約規則")}</h3>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  <li>
                    {t("預約前")}{" "}{selectedVariant.cancellationPolicy.freeCancellationHours}{" "}
                    {t("小時可免費取消")}</li>
                  <li>
                    {formatLateCancellationRule(
                      selectedVariant.cancellationPolicy,
                      catalog.location.currency,
                      locale,
                      t,
                    )}
                  </li>
                  <li>
                    {catalog.location.customerCancellationEnabled
                      ? t("可從預約查詢連結自行取消")
                      : t("取消預約請直接聯繫店家")}
                  </li>
                  <li>
                    {catalog.location.customerRescheduleEnabled
                      ? t("未付款的已確認預約可自行改期")
                      : t("改期請直接聯繫店家")}
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            {t("時段會短暫保留，正式送出前仍會由系統再次確認人員與空間。")}</p>
        </aside>
      </main>
    </div>
  );
}

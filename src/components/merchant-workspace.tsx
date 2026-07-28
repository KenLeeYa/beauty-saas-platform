"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PauseCircle,
  Plus,
  ReceiptText,
  Rocket,
  Settings,
  Store,
  TestTube2,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  MonthCalendar,
} from "@/components/month-calendar";
import type { MerchantView } from "@/components/merchant-route";
import { formatLocalDate } from "@/lib/presentation/date-time";
import type { MerchantWorkspaceData } from "@/server/merchant/data";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type IconComponent = (props: {
  className?: string;
  "aria-hidden"?: "true";
}) => ReactNode;

const navItems: Array<{
  view: MerchantView;
  label: string;
  icon: IconComponent;
}> = [
  { view: "dashboard", label: "營運總覽", icon: LayoutDashboard },
  { view: "calendar", label: "預約行事曆", icon: CalendarDays },
  { view: "bookings", label: "預約管理", icon: BookOpen },
  { view: "customers", label: "顧客", icon: Users },
  { view: "services", label: "服務", icon: BriefcaseBusiness },
  { view: "staff", label: "服務人員", icon: UserRound },
  { view: "resources", label: "空間資源", icon: Wrench },
  { view: "locations", label: "分店", icon: Building2 },
  { view: "reports", label: "報表", icon: BarChart3 },
  { view: "team", label: "團隊", icon: Users },
  { view: "subscription", label: "方案", icon: CreditCard },
  { view: "billing", label: "帳務", icon: ReceiptText },
  { view: "settings", label: "設定", icon: Settings },
];

const viewTitles: Readonly<Record<MerchantView, string>> = {
  dashboard: "營運總覽",
  calendar: "預約行事曆",
  bookings: "預約管理",
  customers: "顧客管理",
  services: "服務項目",
  staff: "服務人員",
  resources: "空間與設備",
  locations: "分店管理",
  reports: "營運報表",
  team: "團隊與權限",
  subscription: "訂閱方案",
  billing: "帳務管理",
  settings: "商家設定",
  setup: "開店設定",
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

const statusClasses: Readonly<Record<string, string>> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-teal/10 text-teal",
  CHECKED_IN: "bg-blue-100 text-blue-800",
  IN_SERVICE: "bg-coral/10 text-coral",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  NO_SHOW: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-slate-200 text-slate-600",
  RESCHEDULED: "bg-violet-100 text-violet-800",
};

const notificationEventLabels: Readonly<Record<string, string>> = {
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

const deliveryStatusLabels: Readonly<Record<string, string>> = {
  PENDING: "等待中",
  SENT: "已送出",
  FAILED: "傳送失敗",
  SKIPPED: "已略過",
  DISABLED: "未啟用",
};

const deliveryStatusClasses: Readonly<Record<string, string>> = {
  PENDING: "bg-amber-100 text-amber-800",
  SENT: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-600",
  DISABLED: "bg-slate-100 text-slate-600",
};

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "teal" | "coral" | "gold" | "ink";
}) {
  const colors = {
    teal: "border-teal",
    coral: "border-coral",
    gold: "border-gold",
    ink: "border-ink",
  };
  return (
    <article
      className={`min-h-28 rounded-md border border-slate-200 border-t-4 bg-white p-4 ${colors[accent]}`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}

export function MerchantWorkspace({
  activeView,
  initialData,
}: {
  activeView: MerchantView;
  initialData: MerchantWorkspaceData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [selectedDate, setSelectedDate] = useState(() =>
    localDate(new Date(), initialData.location.timezone),
  );
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentConfirmationId, setPaymentConfirmationId] =
    useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope = `organization=${encodeURIComponent(
    data.organization.slug,
  )}&location=${encodeURIComponent(data.location.slug)}`;
  const publicBookingPath = `/book/${data.organization.slug}/${data.location.slug}`;
  const can = (capability: string) =>
    data.capabilities.includes(capability);
  const paymentConfirmationBooking = data.bookings.find(
    (booking) => booking.id === paymentConfirmationId,
  );

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
  const filteredBookings = useMemo(
    () =>
      data.bookings
        .filter(
          (booking) =>
            (statusFilter === "ALL" ||
              booking.status === statusFilter) &&
            (!search ||
              `${booking.customerName} ${booking.customerPhone ?? ""} ${booking.serviceName}`
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .sort((left, right) =>
          left.startsAt.localeCompare(right.startsAt),
        ),
    [data.bookings, search, statusFilter],
  );

  async function mutate<T>(
    path: string,
    method: "POST" | "PATCH" | "PUT",
    body: unknown,
  ): Promise<T> {
    const response = await fetch(`${path}?${scope}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken(),
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !payload.data) {
      throw new Error(payload.error?.message ?? "操作失敗。");
    }
    return payload.data;
  }

  async function updateBookingStatus(
    bookingId: string,
    nextStatus: string,
  ): Promise<void> {
    const booking = data.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return;
    }
    const reason = ["CANCELLED", "NO_SHOW"].includes(nextStatus)
      ? window.prompt("請輸入狀態變更原因：")?.trim()
      : undefined;
    if (
      ["CANCELLED", "NO_SHOW"].includes(nextStatus) &&
      !reason
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await mutate<{
        id: string;
        status: string;
        version: number;
      }>("/api/merchant/bookings/status", "PATCH", {
        bookingId,
        nextStatus,
        expectedVersion: booking.version,
        reason,
      });
      setData((current) => ({
        ...current,
        bookings: current.bookings.map((item) =>
          item.id === result.id
            ? {
                ...item,
                status: result.status,
                version: result.version,
              }
            : item,
        ),
      }));
      setFeedback("預約狀態已更新。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "狀態更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmPayment(bookingId: string): Promise<void> {
    const booking = data.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return;
    }
    const amountMinor = Math.max(
      1,
      booking.depositRequiredMinor - booking.paidMinor,
    );
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await mutate<{
        id: string;
        status: string;
        paymentStatus: string;
        paidMinor: number;
        version: number;
      }>("/api/merchant/bookings/payment", "POST", {
        bookingId,
        amountMinor,
        expectedVersion: booking.version,
        method: "MANUAL_TRANSFER",
      });
      setData((current) => ({
        ...current,
        bookings: current.bookings.map((item) =>
          item.id === result.id
            ? {
                ...item,
                status: result.status,
                paymentStatus: result.paymentStatus,
                paidMinor: result.paidMinor,
                version: result.version,
              }
            : item,
        ),
      }));
      setFeedback("訂金已確認，預約狀態已同步更新。");
      setPaymentConfirmationId(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "付款確認失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    path: string,
    transform: (form: FormData) => unknown,
  ): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await mutate(path, "POST", transform(form));
      setFeedback("資料已建立。");
      setFormOpen(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "建立資料失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runSetupAction(
    body: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await mutate<{
        completedSteps: number;
        totalSteps: number;
        testBookingCompleted: boolean;
        goLiveAt: string | null;
        publicBookingPath?: string;
      }>("/api/merchant/setup", "POST", body);
      setData((current) => {
        if (!current.setup) {
          return current;
        }
        const action = String(body.action);
        return {
          ...current,
          location:
            action === "GO_LIVE"
              ? {
                  ...current.location,
                  bookingState: "OPEN",
                  onlineBookingEnabled: true,
                }
              : current.location,
          setup: {
            ...current.setup,
            completedSteps: result.completedSteps,
            totalSteps: result.totalSteps,
            goLiveAt: result.goLiveAt,
            steps: {
              ...current.setup.steps,
              ...(action === "BUSINESS_HOURS"
                ? { businessHours: true }
                : {}),
              ...(action === "POLICIES" ? { policies: true } : {}),
              ...(action === "NOTIFICATIONS"
                ? { notifications: true }
                : {}),
              ...(action === "CREATE_TEST_BOOKING"
                ? { testBooking: result.testBookingCompleted }
                : {}),
            },
          },
        };
      });
      setFeedback(
        body.action === "GO_LIVE"
          ? "公開預約已正式開放。"
          : body.action === "CREATE_TEST_BOOKING"
            ? "測試預約已完成。"
            : "開店設定已儲存。",
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "開店設定更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout(): Promise<void> {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken(),
        },
      });
      router.replace("/");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  function BookingRows({
    bookings,
  }: {
    bookings: MerchantWorkspaceData["bookings"];
  }) {
    if (bookings.length === 0) {
      return (
        <EmptyState
          title="目前沒有預約"
          body="新預約送出後會立即顯示在這裡。"
        />
      );
    }

    return (
      <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {bookings.map((booking) => {
          const time = new Intl.DateTimeFormat("zh-TW", {
            timeZone: data.location.timezone,
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(booking.startsAt));
          return (
            <article
              key={booking.id}
              className="grid gap-3 px-4 py-4 md:grid-cols-[110px_minmax(0,1fr)_auto] md:items-center"
            >
              <div>
                <p className="font-semibold text-ink">{time}</p>
                <span
                  className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-semibold ${
                    statusClasses[booking.status] ??
                    "bg-slate-100 text-slate-700"
                  }`}
                >
                  {statusLabels[booking.status] ?? booking.status}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {booking.customerName}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {booking.serviceName} · {booking.variantName} ·{" "}
                  {booking.staffName ?? "未指定人員"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {booking.customerPhone ?? "未提供電話"} ·{" "}
                  {formatMoney(booking.totalMinor, booking.currency)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {booking.status === "PENDING_PAYMENT" &&
                can("payment.manage") ? (
                  <button
                    className="h-9 rounded-md bg-teal px-3 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      setPaymentConfirmationId(booking.id)
                    }
                  >
                    確認訂金
                  </button>
                ) : null}
                {booking.status === "CONFIRMED" ? (
                  <>
                    <button
                      className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-ink"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() =>
                        void updateBookingStatus(
                          booking.id,
                          "CHECKED_IN",
                        )
                      }
                    >
                      報到
                    </button>
                    <button
                      className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-ink"
                      disabled={isSubmitting}
                      type="button"
                      onClick={() =>
                        void updateBookingStatus(
                          booking.id,
                          "NO_SHOW",
                        )
                      }
                    >
                      未到
                    </button>
                  </>
                ) : null}
                {booking.status === "CHECKED_IN" ? (
                  <button
                    className="h-9 rounded-md bg-coral px-3 text-xs font-semibold text-white"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      void updateBookingStatus(
                        booking.id,
                        "IN_SERVICE",
                      )
                    }
                  >
                    開始服務
                  </button>
                ) : null}
                {booking.status === "IN_SERVICE" ? (
                  <button
                    className="h-9 rounded-md bg-ink px-3 text-xs font-semibold text-white"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      void updateBookingStatus(
                        booking.id,
                        "COMPLETED",
                      )
                    }
                  >
                    完成
                  </button>
                ) : null}
                {["PENDING_PAYMENT", "CONFIRMED"].includes(
                  booking.status,
                ) && can("booking.manage") ? (
                  <button
                    aria-label="取消預約"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                    disabled={isSubmitting}
                    title="取消預約"
                    type="button"
                    onClick={() =>
                      void updateBookingStatus(
                        booking.id,
                        "CANCELLED",
                      )
                    }
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  function renderDashboard(): ReactNode {
    return (
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            accent="teal"
            detail="依分店時區計算"
            label="今日預約"
            value={String(data.stats.todayBookings)}
          />
          <StatCard
            accent="coral"
            detail="需要確認訂金"
            label="待處理"
            value={String(data.stats.pendingBookings)}
          />
          <StatCard
            accent="gold"
            detail="已確認與服務中"
            label="進行中預約"
            value={String(data.stats.confirmedBookings)}
          />
          <StatCard
            accent="ink"
            detail="本月已完成服務"
            label="完成營收"
            value={formatMoney(
              data.stats.monthRevenueMinor,
              data.stats.currency,
            )}
          />
        </div>

        {data.stats.pendingBookings > 0 ? (
          <div className="flex items-start gap-3 border-l-4 border-coral bg-white px-4 py-4">
            <Bell
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-coral"
            />
            <div>
              <p className="font-semibold text-ink">有新預約待確認</p>
              <p className="mt-1 text-sm text-slate-500">
                {data.stats.pendingBookings} 筆預約等待訂金或店家確認。
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-labelledby="dashboard-calendar-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="dashboard-calendar-heading"
                className="text-lg font-semibold text-ink"
              >
                月曆
              </h2>
              <Link
                className="text-sm font-medium text-teal hover:underline"
                href={`/merchant/calendar?${scope}`}
              >
                開啟完整行事曆
              </Link>
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <MonthCalendar
                audience="merchant"
                days={data.calendarDays}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>
          </section>
          <section aria-labelledby="dashboard-day-heading">
            <h2
              id="dashboard-day-heading"
              className="mb-3 text-lg font-semibold text-ink"
            >
              {selectedDate} 預約
            </h2>
            <BookingRows bookings={dayBookings} />
          </section>
        </div>
      </div>
    );
  }

  function renderCalendar(): ReactNode {
    async function toggleDay(closed: boolean): Promise<void> {
      const reason = window.prompt(
        closed ? "請輸入關閉原因：" : "請輸入重新開放備註：",
        closed ? "店休" : "恢復營業",
      );
      if (!reason?.trim()) {
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        await mutate("/api/merchant/schedule/day", "PUT", {
          date: selectedDate,
          closed,
          reason: reason.trim(),
        });
        setData((current) => ({
          ...current,
          calendarDays: current.calendarDays.map((day) =>
            day.date === selectedDate
              ? {
                  ...day,
                  availableCount: closed ? 0 : 1,
                  closedCount: closed ? 1 : 0,
                }
              : day,
          ),
        }));
        setFeedback(closed ? "該日期已關閉預約。" : "該日期已重新開放。");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "日期設定失敗。",
        );
      } finally {
        setIsSubmitting(false);
      }
    }

    const selectedCalendarDay = data.calendarDays.find(
      (day) => day.date === selectedDate,
    );
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              點選日期查看預約，亦可安排店休。
            </p>
            {can("location.manage") ? (
              <button
                className={`h-10 rounded-md border px-4 text-sm font-semibold ${
                  selectedCalendarDay?.closedCount
                    ? "border-teal text-teal"
                    : "border-red-200 text-red-700"
                }`}
                disabled={isSubmitting}
                type="button"
                onClick={() =>
                  void toggleDay(
                    !Boolean(selectedCalendarDay?.closedCount),
                  )
                }
              >
                {selectedCalendarDay?.closedCount
                  ? "重新開放此日"
                  : "關閉此日"}
              </button>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <MonthCalendar
              audience="merchant"
              days={data.calendarDays}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">
            {selectedDate} 排程
          </h2>
          <BookingRows bookings={dayBookings} />
        </section>
      </div>
    );
  }

  function renderBookings(): ReactNode {
    return (
      <div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label>
            <span className="sr-only">搜尋預約</span>
            <input
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-4 outline-none focus:border-teal"
              placeholder="搜尋顧客、電話或服務"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">預約狀態</span>
            <select
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">全部狀態</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <BookingRows bookings={filteredBookings} />
      </div>
    );
  }

  function renderServices(): ReactNode {
    return (
      <div>
        <div className="mb-5 flex justify-end">
          {can("catalog.manage") ? (
            <button
              className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white"
              type="button"
              onClick={() => setFormOpen((current) => !current)}
            >
              {formOpen ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              {formOpen ? "關閉" : "新增服務"}
            </button>
          ) : null}
        </div>
        {formOpen ? (
          <form
            className="mb-6 grid gap-4 border-y border-slate-200 bg-white px-4 py-5 sm:grid-cols-2"
            onSubmit={(event) =>
              void submitForm(
                event,
                "/api/merchant/services",
                (form) => ({
                  name: form.get("name"),
                  variantName: form.get("variantName"),
                  description: form.get("description"),
                  durationMinutes: Number(form.get("durationMinutes")),
                  priceMinor: Math.round(
                    Number(form.get("price")) * 100,
                  ),
                }),
              )
            }
          >
            <Field name="name" label="服務名稱" required />
            <Field name="variantName" label="規格名稱" required />
            <Field
              name="durationMinutes"
              label="服務分鐘"
              min="15"
              required
              type="number"
            />
            <Field
              name="price"
              label="價格（TWD）"
              min="0"
              required
              type="number"
            />
            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                說明
              </span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border border-slate-300 p-3"
                name="description"
              />
            </label>
            <SubmitButton busy={isSubmitting} />
          </form>
        ) : null}
        {data.services.length === 0 ? (
          <EmptyState
            title="尚未建立服務"
            body="新增服務後即可安排人員並開放線上預約。"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.services.map((service) => (
              <article
                key={service.locationServiceId}
                className="rounded-md border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{service.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {service.variantName} · {service.durationMinutes} 分鐘
                    </p>
                  </div>
                  {can("catalog.manage") ? (
                    <button
                      aria-label={
                        service.onlineBookingEnabled
                          ? "關閉線上預約"
                          : "開啟線上預約"
                      }
                      className={`relative h-6 w-11 rounded-full transition ${
                        service.onlineBookingEnabled
                          ? "bg-teal"
                          : "bg-slate-300"
                      }`}
                      title={
                        service.onlineBookingEnabled
                          ? "關閉線上預約"
                          : "開啟線上預約"
                      }
                      type="button"
                      onClick={async () => {
                        try {
                          await mutate(
                            "/api/merchant/services",
                            "PATCH",
                            {
                              locationServiceId:
                                service.locationServiceId,
                              onlineBookingEnabled:
                                !service.onlineBookingEnabled,
                            },
                          );
                          setData((current) => ({
                            ...current,
                            services: current.services.map((item) =>
                              item.locationServiceId ===
                              service.locationServiceId
                                ? {
                                    ...item,
                                    onlineBookingEnabled:
                                      !item.onlineBookingEnabled,
                                  }
                                : item,
                            ),
                          }));
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "設定失敗。",
                          );
                        }
                      }}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                          service.onlineBookingEnabled
                            ? "left-6"
                            : "left-1"
                        }`}
                      />
                    </button>
                  ) : null}
                </div>
                <p className="mt-5 text-xl font-semibold text-ink">
                  {formatMoney(service.priceMinor, data.stats.currency)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {service.staffCount} 位服務人員可承接
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderStaff(): ReactNode {
    return (
      <div>
        <EntityToolbar
          canCreate={can("staff.manage")}
          formOpen={formOpen}
          label="新增服務人員"
          onToggle={() => setFormOpen((current) => !current)}
        />
        {formOpen ? (
          <form
            className="mb-6 grid gap-4 border-y border-slate-200 bg-white px-4 py-5 sm:grid-cols-2"
            onSubmit={(event) =>
              void submitForm(event, "/api/merchant/staff", (form) => ({
                displayName: form.get("displayName"),
                title: form.get("title"),
                skills: String(form.get("skills") ?? "")
                  .split(",")
                  .map((skill) => skill.trim())
                  .filter(Boolean),
              }))
            }
          >
            <Field name="displayName" label="顯示名稱" required />
            <Field name="title" label="職稱" />
            <Field
              name="skills"
              label="技能（以逗號分隔）"
              wide
            />
            <SubmitButton busy={isSubmitting} />
          </form>
        ) : null}
        {data.staff.length === 0 ? (
          <EmptyState
            title="尚未建立服務人員"
            body="建立人員後會自動套用分店營業時間與現有服務。"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.staff.map((staff) => (
              <article
                key={staff.id}
                className="rounded-md border border-slate-200 bg-white p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/10 font-semibold text-gold">
                  {staff.displayName.slice(0, 1)}
                </div>
                <p className="mt-4 font-semibold text-ink">
                  {staff.displayName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {staff.title || "服務人員"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {staff.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderResources(): ReactNode {
    return (
      <div>
        <EntityToolbar
          canCreate={can("resource.manage")}
          formOpen={formOpen}
          label="新增空間或設備"
          onToggle={() => setFormOpen((current) => !current)}
        />
        {formOpen ? (
          <form
            className="mb-6 grid gap-4 border-y border-slate-200 bg-white px-4 py-5 sm:grid-cols-2"
            onSubmit={(event) =>
              void submitForm(
                event,
                "/api/merchant/resources",
                (form) => ({
                  name: form.get("name"),
                  typeName: form.get("typeName"),
                  kind: form.get("kind"),
                }),
              )
            }
          >
            <Field name="name" label="資源名稱" required />
            <Field name="typeName" label="類型名稱" required />
            <label>
              <span className="text-sm font-medium text-slate-700">
                資源種類
              </span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                name="kind"
              >
                <option value="SPA_ROOM">療程室</option>
                <option value="CHAIR">座椅</option>
                <option value="NAIL_TABLE">美甲桌</option>
                <option value="EYELASH_BED">美睫床</option>
                <option value="EQUIPMENT">設備</option>
                <option value="OTHER">其他</option>
              </select>
            </label>
            <SubmitButton busy={isSubmitting} />
          </form>
        ) : null}
        {data.resources.length === 0 ? (
          <EmptyState
            title="尚未建立資源"
            body="療程室、床位或設備可用於避免同時重複預約。"
          />
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
            {data.resources.map((resource) => (
              <article
                key={resource.id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div>
                  <p className="font-semibold text-ink">{resource.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {resource.typeName} · {resource.kind}
                  </p>
                </div>
                <span className="text-xs font-semibold text-teal">
                  {resource.isActive ? "使用中" : "已停用"}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderCustomers(): ReactNode {
    return (
      <div>
        <EntityToolbar
          canCreate={can("customer.manage")}
          formOpen={formOpen}
          label="新增顧客"
          onToggle={() => setFormOpen((current) => !current)}
        />
        {formOpen ? (
          <form
            className="mb-6 grid gap-4 border-y border-slate-200 bg-white px-4 py-5 sm:grid-cols-2"
            onSubmit={(event) =>
              void submitForm(
                event,
                "/api/merchant/customers",
                (form) => ({
                  displayName: form.get("displayName"),
                  phone: form.get("phone"),
                  email: form.get("email"),
                }),
              )
            }
          >
            <Field name="displayName" label="顧客姓名" required />
            <Field name="phone" label="手機" required />
            <Field name="email" label="Email" type="email" wide />
            <SubmitButton busy={isSubmitting} />
          </form>
        ) : null}
        {data.customers.length === 0 ? (
          <EmptyState
            title="尚未有顧客資料"
            body="線上預約確認後，顧客會自動加入 CRM。"
          />
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
            {data.customers.map((customer) => (
              <article
                key={customer.id}
                className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_130px_150px] sm:items-center"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {customer.displayName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {customer.phone ?? "未提供手機"}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  完成 {customer.completedCount} 次
                </p>
                <p className="text-sm font-semibold text-ink sm:text-right">
                  {formatMoney(
                    Number(customer.totalSpendMinor),
                    data.stats.currency,
                  )}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderLocations(): ReactNode {
    async function updateLocation(
      bookingState: "OPEN" | "PAUSED" | "CLOSED",
      onlineBookingEnabled: boolean,
    ): Promise<void> {
      setIsSubmitting(true);
      setError(null);
      try {
        await mutate("/api/merchant/location", "PATCH", {
          bookingState,
          onlineBookingEnabled,
        });
        setData((current) => ({
          ...current,
          location: {
            ...current.location,
            bookingState,
            onlineBookingEnabled,
          },
          locations: current.locations.map((item) =>
            item.id === current.location.id
              ? {
                  ...item,
                  bookingState,
                  onlineBookingEnabled,
                }
              : item,
          ),
        }));
        setFeedback("分店預約狀態已更新。");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "分店設定失敗。",
        );
      } finally {
        setIsSubmitting(false);
      }
    }

    return (
      <div className="space-y-4">
        {data.locations.map((location) => (
          <article
            key={location.id}
            className="rounded-md border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">{location.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  代碼 {location.code} · {location.slug}
                </p>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  location.bookingState === "OPEN"
                    ? "bg-teal/10 text-teal"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {location.bookingState === "OPEN"
                  ? "開放預約"
                  : location.bookingState === "PAUSED"
                    ? "暫停預約"
                    : "關閉"}
              </span>
            </div>
            {location.id === data.location.id &&
            can("location.manage") ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="h-10 rounded-md bg-teal px-4 text-sm font-semibold text-white"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => void updateLocation("OPEN", true)}
                >
                  開放
                </button>
                <button
                  className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-ink"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => void updateLocation("PAUSED", true)}
                >
                  暫停
                </button>
                <button
                  className="h-10 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => void updateLocation("CLOSED", false)}
                >
                  關閉
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    );
  }

  function renderReports(): ReactNode {
    const completed = data.bookings.filter(
      (booking) => booking.status === "COMPLETED",
    );
    const cancelled = data.bookings.filter(
      (booking) => booking.status === "CANCELLED",
    );
    const byService = new Map<string, number>();
    for (const booking of completed) {
      byService.set(
        booking.serviceName,
        (byService.get(booking.serviceName) ?? 0) + booking.totalMinor,
      );
    }
    const max = Math.max(1, ...byService.values());
    return (
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            accent="teal"
            detail="目前載入範圍"
            label="完成服務"
            value={String(completed.length)}
          />
          <StatCard
            accent="coral"
            detail="目前載入範圍"
            label="取消預約"
            value={String(cancelled.length)}
          />
          <StatCard
            accent="ink"
            detail="完成服務合計"
            label="營收"
            value={formatMoney(
              completed.reduce(
                (sum, booking) => sum + booking.totalMinor,
                0,
              ),
              data.stats.currency,
            )}
          />
        </div>
        <section>
          <h2 className="text-lg font-semibold text-ink">服務營收</h2>
          <div className="mt-4 space-y-4 border-y border-slate-200 bg-white px-4 py-5">
            {[...byService.entries()].length > 0 ? (
              [...byService.entries()]
                .sort((left, right) => right[1] - left[1])
                .map(([name, amount]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-ink">{name}</span>
                      <span className="text-slate-600">
                        {formatMoney(amount, data.stats.currency)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full bg-teal"
                        style={{ width: `${(amount / max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-slate-500">
                尚無已完成服務可供彙總。
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderPlan(): ReactNode {
    const subscription = data.subscription;
    return (
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="border-y border-slate-200 bg-white px-5 py-6">
            <p className="text-sm text-slate-500">目前方案</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {subscription?.planName ?? "尚未啟用"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              狀態：{subscription?.status ?? "無訂閱"}
            </p>
            {subscription?.periodEnd ? (
              <p className="mt-1 text-sm text-slate-500">
                本期至{" "}
                {formatLocalDate(
                  subscription.periodEnd,
                  data.location.timezone,
                )}
              </p>
            ) : null}
          </section>
          <aside className="border-t-4 border-gold bg-white p-5 shadow-sm">
            <p className="font-semibold text-ink">方案權益</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              功能權限由方案、訂閱狀態與平台調整共同決定，後台顯示不取代 API 授權檢查。
            </p>
          </aside>
        </div>

        {activeView === "billing" ? (
          <section>
            <h2 className="text-lg font-semibold text-ink">帳單紀錄</h2>
            <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">帳單</th>
                    <th className="px-4 py-3 font-semibold">狀態</th>
                    <th className="px-4 py-3 font-semibold">總額</th>
                    <th className="px-4 py-3 font-semibold">已付</th>
                    <th className="px-4 py-3 font-semibold">繳款期限</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-4 py-3 font-medium text-ink">
                        {invoice.number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {invoice.status}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(
                          invoice.totalMinor,
                          invoice.currency,
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatMoney(
                          invoice.amountPaidMinor,
                          invoice.currency,
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {invoice.dueAt
                          ? formatLocalDate(
                              invoice.dueAt,
                              data.location.timezone,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.invoices.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  目前沒有帳單。
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderSetup(): ReactNode {
    const setup = data.setup;
    if (!setup) {
      return (
        <EmptyState
          title="尚未建立開店流程"
          body="請聯絡平台管理員確認商家核准與試用方案狀態。"
        />
      );
    }
    const steps = [
      { key: "brand", label: "品牌資料", done: setup.steps.brand },
      {
        key: "location",
        label: "分店資料",
        done: setup.steps.location,
      },
      {
        key: "businessHours",
        label: "營業時間",
        done: setup.steps.businessHours,
      },
      {
        key: "service",
        label: "服務項目",
        done: setup.steps.service,
        href: `/merchant/services?${scope}`,
      },
      {
        key: "staff",
        label: "服務人員與技能",
        done: setup.steps.staff,
        href: `/merchant/staff?${scope}`,
      },
      {
        key: "resource",
        label: "空間與設備",
        done: setup.steps.resource,
        href: `/merchant/resources?${scope}`,
      },
      {
        key: "policies",
        label: "預約、取消與訂金規則",
        done: setup.steps.policies,
      },
      {
        key: "notifications",
        label: "通知通道",
        done: setup.steps.notifications,
      },
      {
        key: "testBooking",
        label: "測試預約",
        done: setup.steps.testBooking,
      },
    ] as const;
    const baseSetupComplete = steps
      .slice(0, 8)
      .every((step) => step.done);
    return (
      <div className="max-w-3xl space-y-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">完成進度</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {setup.completedSteps} / {setup.totalSteps}
            </p>
          </div>
          <span className="text-sm font-medium text-teal">
            {setup.goLiveAt ? "已上線" : "尚未上線"}
          </span>
        </div>
        <ol className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
          {steps.map((step, index) => (
            <li
              key={step.key}
              className="flex items-center gap-3 px-4 py-4"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                  step.done
                    ? "bg-teal text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {step.done ? (
                  <Check aria-hidden="true" className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0 flex-1 font-medium text-ink">
                {step.label}
              </span>
              {"href" in step && step.href ? (
                <Link
                  className="text-sm font-semibold text-teal hover:underline"
                  href={step.href}
                >
                  {step.done ? "查看" : "設定"}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>

        {!setup.steps.businessHours ? (
          <form
            className="border-y border-slate-200 bg-white px-5 py-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void runSetupAction({
                action: "BUSINESS_HOURS",
                days: [1, 2, 3, 4, 5, 6],
                opensAt: String(form.get("opensAt")),
                closesAt: String(form.get("closesAt")),
              });
            }}
          >
            <h2 className="font-semibold text-ink">設定營業時間</h2>
            <p className="mt-1 text-sm text-slate-500">
              週一至週六
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-slate-700">
                  開始
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="10:00"
                  name="opensAt"
                  required
                  type="time"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  結束
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="20:00"
                  name="closesAt"
                  required
                  type="time"
                />
              </label>
            </div>
            <button
              className="mt-5 h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              儲存營業時間
            </button>
          </form>
        ) : null}

        {!setup.steps.policies ? (
          <form
            className="border-y border-slate-200 bg-white px-5 py-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void runSetupAction({
                action: "POLICIES",
                slotIntervalMinutes: String(
                  form.get("slotIntervalMinutes"),
                ),
                minimumLeadMinutes: Number(
                  form.get("minimumLeadMinutes"),
                ),
                maximumAdvanceDays: Number(
                  form.get("maximumAdvanceDays"),
                ),
                holdMinutes: Number(form.get("holdMinutes")),
                cancellationCutoffHours: Number(
                  form.get("cancellationCutoffHours"),
                ),
                depositMode: String(form.get("depositMode")),
                depositAmountMinor:
                  Number(form.get("depositAmount")) * 100,
                depositPercentage: Number(
                  form.get("depositPercentage"),
                ),
              });
            }}
          >
            <h2 className="font-semibold text-ink">設定預約政策</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label>
                <span className="text-sm font-medium text-slate-700">
                  時段間隔
                </span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                  defaultValue="30"
                  name="slotIntervalMinutes"
                >
                  <option value="15">15 分鐘</option>
                  <option value="30">30 分鐘</option>
                  <option value="60">60 分鐘</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  最少提前分鐘
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="60"
                  min="0"
                  name="minimumLeadMinutes"
                  required
                  type="number"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  最遠可約天數
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="60"
                  min="1"
                  name="maximumAdvanceDays"
                  required
                  type="number"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  保留分鐘
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="10"
                  min="5"
                  name="holdMinutes"
                  required
                  type="number"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  免費取消小時
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="24"
                  min="0"
                  name="cancellationCutoffHours"
                  required
                  type="number"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  訂金方式
                </span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                  defaultValue="FIXED"
                  name="depositMode"
                >
                  <option value="NONE">不收訂金</option>
                  <option value="FIXED">固定金額</option>
                  <option value="PERCENTAGE">比例</option>
                </select>
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  固定訂金（元）
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="500"
                  min="0"
                  name="depositAmount"
                  type="number"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-700">
                  訂金比例（%）
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
                  defaultValue="20"
                  max="100"
                  min="0"
                  name="depositPercentage"
                  type="number"
                />
              </label>
            </div>
            <button
              className="mt-5 h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              儲存預約政策
            </button>
          </form>
        ) : null}

        {!setup.steps.notifications ? (
          <section className="border-y border-slate-200 bg-white px-5 py-6">
            <h2 className="font-semibold text-ink">確認通知通道</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              LINE 與 Email 先建立為停用狀態，之後加入正式憑證才會發送。
            </p>
            <button
              className="mt-4 h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting}
              type="button"
              onClick={() =>
                void runSetupAction({
                  action: "NOTIFICATIONS",
                  channels: ["LINE", "EMAIL"],
                })
              }
            >
              確認通知設定
            </button>
          </section>
        ) : null}

        {!setup.steps.testBooking ? (
          <section className="border-y border-slate-200 bg-white px-5 py-6">
            <h2 className="font-semibold text-ink">執行測試預約</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              系統會使用第一個可用服務、服務人員與時段完成一筆測試預約，不列入正式用量。
            </p>
            <button
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-coral px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting || !baseSetupComplete}
              type="button"
              onClick={() =>
                void runSetupAction({
                  action: "CREATE_TEST_BOOKING",
                })
              }
            >
              <TestTube2 aria-hidden="true" className="h-4 w-4" />
              建立並完成測試預約
            </button>
          </section>
        ) : null}

        {setup.steps.testBooking && !setup.goLiveAt ? (
          <section className="border-l-4 border-teal bg-white px-5 py-6">
            <h2 className="font-semibold text-ink">準備正式上線</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              上線後會公開商家頁並開放此分店接受顧客預約。
            </p>
            <button
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-teal px-5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "確定要開放公開預約並正式上線嗎？",
                  )
                ) {
                  void runSetupAction({ action: "GO_LIVE" });
                }
              }}
            >
              <Rocket aria-hidden="true" className="h-4 w-4" />
              正式上線
            </button>
          </section>
        ) : null}

        {setup.goLiveAt ? (
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-md bg-teal px-5 text-sm font-semibold text-white"
            href={publicBookingPath}
            target="_blank"
          >
            開啟公開預約
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    );
  }

  function renderSettings(): ReactNode {
    const notificationChannels = ["LINE", "EMAIL", "SMS"] as const;
    const integrationByChannel = new Map(
      data.notificationIntegrations.map((integration) => [
        integration.channel,
        integration,
      ]),
    );

    return (
      <div className="space-y-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="border-y border-slate-200 bg-white px-5 py-6">
            <h2 className="font-semibold text-ink">公開預約連結</h2>
            <p className="mt-3 break-all text-sm text-slate-600">
              {publicBookingPath}
            </p>
            <Link
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal hover:underline"
              href={publicBookingPath}
              target="_blank"
            >
              開啟預約頁
              <ExternalLink
                aria-hidden="true"
                className="h-4 w-4"
              />
            </Link>
          </section>
          <section className="border-y border-slate-200 bg-white px-5 py-6">
            <h2 className="font-semibold text-ink">分店預約狀態</h2>
            <p className="mt-3 text-sm text-slate-600">
              {data.location.bookingState} ·{" "}
              {data.location.onlineBookingEnabled
                ? "線上預約已開啟"
                : "線上預約已關閉"}
            </p>
            <Link
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal hover:underline"
              href={`/merchant/locations?${scope}`}
            >
              管理分店
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4"
              />
            </Link>
          </section>
        </div>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Bell aria-hidden="true" className="h-5 w-5 text-teal" />
            <h2 className="font-semibold text-ink">通知通道</h2>
          </div>
          <div className="grid gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:grid-cols-3">
            {notificationChannels.map((channel) => {
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

        <section>
          <h2 className="mb-3 font-semibold text-ink">最近通知結果</h2>
          {data.notificationDeliveries.length === 0 ? (
            <EmptyState
              title="尚未有通知紀錄"
              body="目前沒有可顯示的通知結果。"
            />
          ) : (
            <div className="overflow-x-auto border-y border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">時間</th>
                    <th className="px-4 py-3 font-medium">事件</th>
                    <th className="px-4 py-3 font-medium">通道</th>
                    <th className="px-4 py-3 font-medium">結果</th>
                    <th className="px-4 py-3 font-medium">錯誤碼</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.notificationDeliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {new Intl.DateTimeFormat("zh-TW", {
                          timeZone: data.location.timezone,
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        }).format(new Date(delivery.createdAt))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink">
                        {notificationEventLabels[delivery.eventType] ??
                          delivery.eventType}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.channel}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-semibold ${
                            deliveryStatusClasses[delivery.status] ??
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {deliveryStatusLabels[delivery.status] ??
                            delivery.status}
                        </span>
                      </td>
                      <td className="max-w-56 break-all px-4 py-3 text-xs text-slate-500">
                        {delivery.errorCode ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderContent(): ReactNode {
    switch (activeView) {
      case "dashboard":
        return renderDashboard();
      case "calendar":
        return renderCalendar();
      case "bookings":
        return renderBookings();
      case "services":
        return renderServices();
      case "staff":
      case "team":
        return renderStaff();
      case "resources":
        return renderResources();
      case "customers":
        return renderCustomers();
      case "locations":
        return renderLocations();
      case "reports":
        return renderReports();
      case "subscription":
      case "billing":
        return renderPlan();
      case "setup":
        return renderSetup();
      case "settings":
        return renderSettings();
    }
  }

  return (
    <div className="min-h-screen bg-mist lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition lg:static lg:w-auto ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <Link
            className="flex items-center gap-3"
            href={`/merchant/dashboard?${scope}`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-sm font-bold text-white">
              B
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                Beauty Workspace
              </span>
              <span className="block text-xs text-slate-500">
                {data.organization.name}
              </span>
            </span>
          </Link>
          <button
            aria-label="關閉選單"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 lg:hidden"
            title="關閉選單"
            type="button"
            onClick={() => setIsMenuOpen(false)}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <nav
          aria-label="店家後台"
          className="h-[calc(100vh-8rem)] overflow-y-auto px-3 py-4"
        >
          <Link
            className={`mb-1 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
              activeView === "setup"
                ? "bg-coral/10 text-coral"
                : "text-slate-600 hover:bg-slate-100 hover:text-ink"
            }`}
            href={`/merchant/setup?${scope}`}
          >
            <PackagePlus aria-hidden="true" className="h-4 w-4" />
            開店設定
          </Link>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.view}
                className={`mb-1 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                  activeView === item.view
                    ? "bg-ink text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                }`}
                href={`/merchant/${item.view}?${scope}`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-ink"
            disabled={isSubmitting}
            type="button"
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      {isMenuOpen ? (
        <button
          aria-label="關閉選單"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          type="button"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
            <button
              aria-label="開啟選單"
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 lg:hidden"
              title="開啟選單"
              type="button"
              onClick={() => setIsMenuOpen(true)}
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {data.location.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {data.session.displayName} · {data.session.email}
              </p>
            </div>
            <Link
              aria-label="開啟顧客預約頁"
              className="flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-ink hover:border-teal hover:text-teal"
              href={publicBookingPath}
              target="_blank"
              title="開啟顧客預約頁"
            >
              <Store aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">顧客預約頁</span>
              <ExternalLink
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
            </Link>
          </div>
        </header>

        <main
          id="main-content"
          className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal">
                {data.organization.name}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">
                {viewTitles[activeView]}
              </h1>
            </div>
            {data.location.bookingState !== "OPEN" ? (
              <span className="flex items-center gap-2 rounded bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                <PauseCircle
                  aria-hidden="true"
                  className="h-4 w-4"
                />
                目前暫停公開預約
              </span>
            ) : null}
          </div>

          {feedback ? (
            <p
              role="status"
              className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              {feedback}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          {renderContent()}
        </main>
      </div>

      {paymentConfirmationId && paymentConfirmationBooking ? (
        <div
          aria-labelledby="payment-confirmation-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
            <h2
              id="payment-confirmation-title"
              className="text-lg font-semibold text-ink"
            >
              確認已收到訂金
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              將記錄已收到{" "}
              {formatMoney(
                Math.max(
                  1,
                  paymentConfirmationBooking.depositRequiredMinor -
                    paymentConfirmationBooking.paidMinor,
                ),
                paymentConfirmationBooking.currency,
              )}
              ，完成後預約狀態會同步更新。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                disabled={isSubmitting}
                type="button"
                onClick={() => setPaymentConfirmationId(null)}
              >
                返回
              </button>
              <button
                className="h-10 rounded-md bg-teal px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                disabled={isSubmitting}
                type="button"
                onClick={() =>
                  void confirmPayment(paymentConfirmationId)
                }
              >
                {isSubmitting ? "處理中..." : "確認已收款"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  min,
  wide = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-teal"
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function SubmitButton({ busy }: { busy: boolean }) {
  return (
    <button
      className="flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50 sm:self-end"
      disabled={busy}
      type="submit"
    >
      <Check aria-hidden="true" className="h-4 w-4" />
      {busy ? "儲存中..." : "儲存"}
    </button>
  );
}

function EntityToolbar({
  canCreate,
  formOpen,
  label,
  onToggle,
}: {
  canCreate: boolean;
  formOpen: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="mb-5 flex justify-end">
      {canCreate ? (
        <button
          className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white"
          type="button"
          onClick={onToggle}
        >
          {formOpen ? (
            <X aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Plus aria-hidden="true" className="h-4 w-4" />
          )}
          {formOpen ? "關閉" : label}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import {
  BarChart3,
  BadgeDollarSign,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  ExternalLink,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PauseCircle,
  Plus,
  ReceiptText,
  Rocket,
  Save,
  Settings,
  Store,
  TestTube2,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
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
import {
  formatLocalDate,
  formatLocalDateKey,
  formatLocalMonthDayTime,
} from "@/lib/presentation/date-time";
import {
  CustomerManagement,
  type CustomerProfileUpdate,
  type NewCustomerInput,
} from "@/modules/crm/components/customer-management";
import { NotificationHealthPanel } from "@/modules/notifications/components/notification-health-panel";
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
  { view: "operations", label: "出勤與薪資審核", icon: Clock3 },
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
  operations: "出勤與薪資審核",
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

function publicMediaLoader({ src }: ImageLoaderProps): string {
  return src;
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
      className={`rounded-md border border-slate-200 border-t-4 bg-white p-3 sm:min-h-28 sm:p-4 ${colors[accent]}`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink sm:mt-2 sm:text-2xl">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:mt-1 sm:text-xs">
        {detail}
      </p>
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
    crmVisible,
  }: {
    activeView: MerchantView;
    initialData: MerchantWorkspaceData;
    crmVisible: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const initialSelectedDate = formatLocalDateKey(
    new Date(),
    initialData.location.timezone,
  );
  const initialScheduleDay = initialData.calendarDays.find(
    (day) => day.date === initialSelectedDate,
  );
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentConfirmationId, setPaymentConfirmationId] =
    useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<
    "NORMAL" | "CUSTOM" | "CLOSED"
  >(initialScheduleDay?.scheduleMode ?? "NORMAL");
  const [scheduleReason, setScheduleReason] = useState(
    initialScheduleDay?.scheduleReason ?? "",
  );
  const [scheduleSegments, setScheduleSegments] = useState<
    Array<{ startsAt: string; endsAt: string }>
  >(
    initialScheduleDay?.scheduleMode === "CUSTOM"
      ? initialScheduleDay.scheduleSegments
      : (initialScheduleDay?.defaultScheduleSegments ?? []),
  );
  const scope = `organization=${encodeURIComponent(
    data.organization.slug,
  )}&location=${encodeURIComponent(data.location.slug)}`;
  const publicBookingPath = `/book/${data.organization.slug}/${data.location.slug}`;
  const can = (capability: string) =>
    data.capabilities.includes(capability);
  const paymentConfirmationBooking = data.bookings.find(
    (booking) => booking.id === paymentConfirmationId,
  );

  function selectCalendarDate(date: string): void {
    const day = data.calendarDays.find(
      (calendarDay) => calendarDay.date === date,
    );
    setSelectedDate(date);
    setScheduleMode(day?.scheduleMode ?? "NORMAL");
    setScheduleReason(day?.scheduleReason ?? "");
    setScheduleSegments(
      day?.scheduleMode === "CUSTOM"
        ? day.scheduleSegments
        : (day?.defaultScheduleSegments ?? []),
    );
  }

  const dayBookings = useMemo(
    () =>
      data.bookings
        .filter(
          (booking) =>
            formatLocalDateKey(
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

  async function uploadMedia(
    kind:
      | "ORGANIZATION_LOGO"
      | "ORGANIZATION_COVER"
      | "LOCATION_COVER"
      | "SERVICE_IMAGE"
      | "STAFF_PHOTO",
    targetId: string,
    file: File,
  ): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("targetId", targetId);
    form.set("file", file);
    try {
      const response = await fetch(`/api/merchant/media?${scope}`, {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken(),
        },
        body: form,
      });
      const payload = (await response.json()) as ApiEnvelope<{
        path: string;
        url: string;
      }>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "圖片上傳失敗。");
      }
      const url = payload.data.url;
      setData((current) => ({
        ...current,
        organization:
          kind === "ORGANIZATION_LOGO"
            ? { ...current.organization, logoUrl: url }
            : kind === "ORGANIZATION_COVER"
              ? { ...current.organization, coverImageUrl: url }
              : current.organization,
        location:
          kind === "LOCATION_COVER"
            ? { ...current.location, coverImageUrl: url }
            : current.location,
        locations:
          kind === "LOCATION_COVER"
            ? current.locations.map((item) =>
                item.id === targetId
                  ? { ...item, coverImageUrl: url }
                  : item,
              )
            : current.locations,
        services:
          kind === "SERVICE_IMAGE"
            ? current.services.map((service) =>
                service.id === targetId
                  ? { ...service, imageUrl: url }
                  : service,
              )
            : current.services,
        staff:
          kind === "STAFF_PHOTO"
            ? current.staff.map((staff) =>
                staff.id === targetId
                  ? { ...staff, photoUrl: url }
                  : staff,
              )
            : current.staff,
      }));
      setFeedback("圖片已更新。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "圖片上傳失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveDaySchedule(): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const segments = scheduleMode === "CUSTOM" ? scheduleSegments : [];
      await mutate("/api/merchant/schedule/day", "PUT", {
        date: selectedDate,
        mode: scheduleMode,
        reason: scheduleReason,
        segments,
      });
      setData((current) => ({
        ...current,
        calendarDays: current.calendarDays.map((day) =>
          day.date === selectedDate
            ? {
                ...day,
                availableCount:
                  scheduleMode === "CLOSED"
                    ? 0
                    : scheduleMode === "CUSTOM"
                      ? 1
                      : day.defaultScheduleSegments.length > 0
                        ? 1
                        : 0,
                closedCount:
                  scheduleMode === "CLOSED" ||
                  (scheduleMode === "NORMAL" &&
                    day.defaultScheduleSegments.length === 0)
                    ? 1
                    : 0,
                scheduleMode,
                scheduleReason,
                scheduleSegments:
                  scheduleMode === "CUSTOM"
                    ? segments
                    : day.defaultScheduleSegments,
              }
            : day,
        ),
      }));
      setFeedback("當日開放時段已更新。");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "日期設定失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createCustomer(
    input: NewCustomerInput,
  ): Promise<boolean> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await mutate<{ id: string }>(
        "/api/merchant/customers",
        "POST",
        input,
      );
      setData((current) => ({
        ...current,
        customers: [
          {
            id: result.id,
            displayName: input.displayName,
            phone: current.capabilities.includes("customer.sensitive.read")
              ? input.phone
              : null,
            birthday: input.birthday || null,
            depositMode: "DEFAULT",
            isBlacklisted: false,
            blacklistReason: null,
            lastServiceAt: null,
            completedCount: 0,
            cancelledCount: 0,
            noShowCount: 0,
            totalSpendMinor: "0",
            tags: [],
            notes: [],
          },
          ...current.customers,
        ],
      }));
      setFeedback("顧客已建立。");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "顧客建立失敗。",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateCustomer(
    customerId: string,
    update: CustomerProfileUpdate,
  ): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      await mutate("/api/merchant/customers", "PATCH", {
        customerId,
        ...update,
      });
      setData((current) => ({
        ...current,
        customers: current.customers.map((customer) =>
          customer.id === customerId
            ? {
                ...customer,
                ...(update.birthday !== undefined
                  ? { birthday: update.birthday || null }
                  : {}),
                ...(update.depositMode
                  ? { depositMode: update.depositMode }
                  : {}),
                ...(update.isBlacklisted !== undefined
                  ? {
                      isBlacklisted: update.isBlacklisted,
                      blacklistReason: update.isBlacklisted
                        ? update.blacklistReason ?? null
                        : null,
                    }
                  : {}),
              }
            : customer,
        ),
      }));
      setFeedback("顧客資料已更新。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "顧客更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createCustomerTag(input: {
    name: string;
    color: string;
  }): Promise<boolean> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const tag = await mutate<
        MerchantWorkspaceData["customerTags"][number]
      >("/api/merchant/customers/tags", "POST", {
        action: "CREATE",
        ...input,
      });
      setData((current) => ({
        ...current,
        customerTags: [...current.customerTags, tag].sort((left, right) =>
          left.name.localeCompare(right.name, "zh-TW"),
        ),
      }));
      setFeedback("顧客標籤已建立。");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "顧客標籤建立失敗。",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function setCustomerTag(input: {
    customerId: string;
    tagId: string;
    assigned: boolean;
  }): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      await mutate("/api/merchant/customers/tags", "POST", {
        action: input.assigned ? "ASSIGN" : "UNASSIGN",
        customerId: input.customerId,
        tagId: input.tagId,
      });
      setData((current) => {
        const tag = current.customerTags.find(
          (candidate) => candidate.id === input.tagId,
        );
        return {
          ...current,
          customers: current.customers.map((customer) =>
            customer.id === input.customerId
              ? {
                  ...customer,
                  tags:
                    input.assigned && tag
                      ? customer.tags.some(
                          (assignedTag) => assignedTag.id === tag.id,
                        )
                        ? customer.tags
                        : [...customer.tags, tag]
                      : customer.tags.filter(
                          (assignedTag) => assignedTag.id !== input.tagId,
                        ),
                }
              : customer,
          ),
        };
      });
      setFeedback(input.assigned ? "標籤已加入。" : "標籤已移除。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "顧客標籤更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createCustomerNote(input: {
    customerId: string;
    note: string;
    sensitivity: "STANDARD" | "SENSITIVE";
  }): Promise<boolean> {
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const note = await mutate<
        MerchantWorkspaceData["customers"][number]["notes"][number]
      >("/api/merchant/customers/notes", "POST", input);
      setData((current) => ({
        ...current,
        customers: current.customers.map((customer) =>
          customer.id === input.customerId
            ? { ...customer, notes: [note, ...customer.notes].slice(0, 5) }
            : customer,
        ),
      }));
      setFeedback("顧客備註已新增。");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "顧客備註新增失敗。",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryNotification(deliveryId: string): Promise<void> {
    const delivery = data.notificationDeliveries.find(
      (item) => item.id === deliveryId,
    );
    if (!delivery) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await mutate<{
        jobId: string;
        status: "PENDING";
        nextAttemptAt: string;
      }>("/api/merchant/notifications/retry", "POST", { deliveryId });
      setData((current) => ({
        ...current,
        notificationHealth: {
          ...current.notificationHealth,
          pending: current.notificationHealth.pending + 1,
          failed:
            delivery.jobStatus === "FAILED"
              ? Math.max(0, current.notificationHealth.failed - 1)
              : current.notificationHealth.failed,
          deadLetter:
            delivery.jobStatus === "DEAD_LETTER"
              ? Math.max(0, current.notificationHealth.deadLetter - 1)
              : current.notificationHealth.deadLetter,
        },
        notificationDeliveries: current.notificationDeliveries.map((item) =>
          item.jobId === result.jobId
            ? {
                ...item,
                jobStatus: result.status,
                nextAttemptAt: result.nextAttemptAt,
              }
            : item,
        ),
      }));
      setFeedback("通知已排入重試佇列。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "通知重試失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateServiceBuffers(
    event: FormEvent<HTMLFormElement>,
    locationServiceId: string,
  ): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const preBufferMinutes = Number(form.get("preBufferMinutes"));
    const postBufferMinutes = Number(form.get("postBufferMinutes"));
    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
    try {
      await mutate("/api/merchant/services", "PATCH", {
        action: "UPDATE_BUFFERS",
        locationServiceId,
        preBufferMinutes,
        postBufferMinutes,
      });
      setData((current) => ({
        ...current,
        services: current.services.map((service) =>
          service.locationServiceId === locationServiceId
            ? { ...service, preBufferMinutes, postBufferMinutes }
            : service,
        ),
      }));
      setFeedback("服務緩衝時間已更新，可預約時段會立即重新計算。");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "服務緩衝時間更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateBookingStatus(
    bookingId: string,
    nextStatus: string,
  ): Promise<void> {
    const booking = data.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return;
    }
    const reason = ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(
      nextStatus,
    )
      ? window.prompt("請輸入狀態變更原因：")?.trim()
      : undefined;
    if (
      ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(nextStatus) &&
      !reason
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback(null);
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
          const time = formatLocalMonthDayTime(
            booking.startsAt,
            data.location.timezone,
          );
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
                {booking.status === "PENDING_PAYMENT" &&
                can("booking.manage") ? (
                  <button
                    className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      void updateBookingStatus(booking.id, "EXPIRED")
                    }
                  >
                    標記失效
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
      <div className="space-y-5 sm:space-y-8">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
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
          <div className="flex items-start gap-3 border-l-4 border-coral bg-white px-3 py-3 sm:px-4 sm:py-4">
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

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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
                onSelectDate={selectCalendarDate}
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
    const selectedCalendarDay = data.calendarDays.find(
      (day) => day.date === selectedDate,
    );
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section>
          <p className="mb-3 text-sm text-slate-500">
            點選日期後，可使用每週營業時間、設定當日特別時段，或整日關閉。
          </p>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <MonthCalendar
              audience="merchant"
              days={data.calendarDays}
              selectedDate={selectedDate}
              onSelectDate={selectCalendarDate}
            />
          </div>
        </section>
        <div className="space-y-6">
          <section aria-labelledby="day-schedule-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2
                  className="text-lg font-semibold text-ink"
                  id="day-schedule-heading"
                >
                  {selectedDate} 開放時段
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedCalendarDay?.bookedCount ?? 0} 筆預約
                </p>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  scheduleMode === "CLOSED"
                    ? "bg-red-100 text-red-700"
                    : scheduleMode === "CUSTOM"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-teal/10 text-teal"
                }`}
              >
                {scheduleMode === "CLOSED"
                  ? "整日關閉"
                  : scheduleMode === "CUSTOM"
                    ? "自訂時段"
                    : "每週設定"}
              </span>
            </div>

            {can("location.manage") ? (
              <div className="border-y border-slate-200 bg-white px-4 py-5">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="當日營業模式">
                  {(
                    [
                      ["NORMAL", "正常營業"],
                      ["CUSTOM", "自訂時段"],
                      ["CLOSED", "整日關閉"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      aria-pressed={scheduleMode === mode}
                      className={`min-h-10 rounded-md border px-2 text-xs font-semibold ${
                        scheduleMode === mode
                          ? "border-ink bg-ink text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                      key={mode}
                      type="button"
                      onClick={() => {
                        setScheduleMode(mode);
                        if (
                          mode === "CUSTOM" &&
                          scheduleSegments.length === 0
                        ) {
                          setScheduleSegments([
                            { startsAt: "10:00", endsAt: "18:00" },
                          ]);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {scheduleMode === "CUSTOM" ? (
                  <div className="mt-4 space-y-3">
                    {scheduleSegments.map((segment, index) => (
                      <div
                        className="grid grid-cols-[1fr_auto_1fr_36px] items-end gap-2"
                        key={`${index}-${segment.startsAt}-${segment.endsAt}`}
                      >
                        <Field
                          label={`時段 ${index + 1} 開始`}
                          name={`schedule-start-${index}`}
                          type="time"
                          value={segment.startsAt}
                          onChange={(value) =>
                            setScheduleSegments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, startsAt: value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <span className="pb-3 text-slate-400">至</span>
                        <Field
                          label={`時段 ${index + 1} 結束`}
                          name={`schedule-end-${index}`}
                          type="time"
                          value={segment.endsAt}
                          onChange={(value) =>
                            setScheduleSegments((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, endsAt: value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <button
                          aria-label={`移除時段 ${index + 1}`}
                          className="mb-1 flex h-10 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                          disabled={scheduleSegments.length === 1}
                          title="移除時段"
                          type="button"
                          onClick={() =>
                            setScheduleSegments((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {scheduleSegments.length < 3 ? (
                      <button
                        className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-teal"
                        type="button"
                        onClick={() =>
                          setScheduleSegments((current) => [
                            ...current,
                            { startsAt: "", endsAt: "" },
                          ])
                        }
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        新增時段
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700">
                    備註
                  </span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    maxLength={240}
                    placeholder={
                      scheduleMode === "CLOSED"
                        ? "例如：店休、教育訓練"
                        : "例如：節日調整"
                    }
                    value={scheduleReason}
                    onChange={(event) =>
                      setScheduleReason(event.target.value)
                    }
                  />
                </label>
                <button
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => void saveDaySchedule()}
                >
                  <Clock3 aria-hidden="true" className="h-4 w-4" />
                  儲存當日設定
                </button>
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">
              當日預約
            </h2>
            <BookingRows bookings={dayBookings} />
          </section>
        </div>
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
    const serviceGroups = new Map<
      string,
      MerchantWorkspaceData["services"]
    >();
    for (const service of data.services) {
      const groupName = service.categoryName ?? "未分類";
      serviceGroups.set(groupName, [
        ...(serviceGroups.get(groupName) ?? []),
        service,
      ]);
    }
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
                  categoryName: form.get("categoryName"),
                  description: form.get("description"),
                  durationMinutes: Number(form.get("durationMinutes")),
                  priceMinor: Math.round(
                    Number(form.get("price")) * 100,
                  ),
                  preBufferMinutes: Number(form.get("preBufferMinutes")),
                  postBufferMinutes: Number(form.get("postBufferMinutes")),
                }),
              )
            }
          >
            <Field name="name" label="服務名稱" required />
            <Field name="variantName" label="規格名稱" required />
            <Field
              name="categoryName"
              label="服務群組"
              defaultValue="一般服務"
              required
            />
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
            <Field
              defaultValue="0"
              label="服務前緩衝（分鐘）"
              max="240"
              min="0"
              name="preBufferMinutes"
              type="number"
            />
            <Field
              defaultValue="0"
              label="服務後緩衝（分鐘）"
              max="240"
              min="0"
              name="postBufferMinutes"
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
          <div className="space-y-7">
            {[...serviceGroups.entries()].map(([groupName, services]) => (
              <section aria-label={`${groupName}服務群組`} key={groupName}>
                <div className="mb-3 flex items-center gap-2">
                  <PackagePlus
                    aria-hidden="true"
                    className="h-4 w-4 text-teal"
                  />
                  <h2 className="font-semibold text-ink">{groupName}</h2>
                  <span className="text-xs text-slate-400">
                    {services.length} 項
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {services.map((service) => (
                    <article
                      key={service.locationServiceId}
                      className="overflow-hidden rounded-md border border-slate-200 bg-white"
                    >
                      {service.imageUrl ? (
                        <Image
                          alt={`${service.name}服務圖片`}
                          className="aspect-[16/9] w-full object-cover"
                          height={360}
                          loader={publicMediaLoader}
                          src={service.imageUrl}
                          unoptimized
                          width={640}
                        />
                      ) : (
                        <div className="flex aspect-[16/9] items-center justify-center bg-slate-100 text-slate-400">
                          <ImagePlus
                            aria-hidden="true"
                            className="h-7 w-7"
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">
                              {service.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {service.variantName} · {service.durationMinutes}{" "}
                              分鐘
                            </p>
                          </div>
                          {can("catalog.manage") ? (
                            <button
                              aria-label={
                                service.onlineBookingEnabled
                                  ? "關閉線上預約"
                                  : "開啟線上預約"
                              }
                              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
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
                          {formatMoney(
                            service.priceMinor,
                            data.stats.currency,
                          )}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            {service.staffCount} 位服務人員可承接
                          </p>
                          {can("catalog.manage") ? (
                            <MediaUploadButton
                              busy={isSubmitting}
                              label="上傳服務圖片"
                              onFile={(file) =>
                                void uploadMedia(
                                  "SERVICE_IMAGE",
                                  service.id,
                                  file,
                                )
                              }
                            />
                          ) : null}
                        </div>
                        {can("catalog.manage") ? (
                          <form
                            className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-end gap-2 border-t border-slate-100 pt-4"
                            onSubmit={(event) =>
                              void updateServiceBuffers(
                                event,
                                service.locationServiceId,
                              )
                            }
                          >
                            <label className="min-w-0">
                              <span className="block text-xs font-medium text-slate-500">
                                前置緩衝
                              </span>
                              <input
                                className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                                defaultValue={service.preBufferMinutes}
                                disabled={isSubmitting}
                                max="240"
                                min="0"
                                name="preBufferMinutes"
                                type="number"
                              />
                            </label>
                            <label className="min-w-0">
                              <span className="block text-xs font-medium text-slate-500">
                                後置緩衝
                              </span>
                              <input
                                className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                                defaultValue={service.postBufferMinutes}
                                disabled={isSubmitting}
                                max="240"
                                min="0"
                                name="postBufferMinutes"
                                type="number"
                              />
                            </label>
                            <button
                              aria-label="儲存服務緩衝時間"
                              className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white disabled:opacity-50"
                              disabled={isSubmitting}
                              title="儲存服務緩衝時間"
                              type="submit"
                            >
                              <Save aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </form>
                        ) : (
                          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                            前置 {service.preBufferMinutes} 分鐘 · 後置{" "}
                            {service.postBufferMinutes} 分鐘
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
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
                <div className="flex items-start gap-3">
                  {staff.photoUrl ? (
                    <Image
                      alt={`${staff.displayName} 的照片`}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                      height={64}
                      loader={publicMediaLoader}
                      src={staff.photoUrl}
                      unoptimized
                      width={64}
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gold/10 text-lg font-semibold text-gold">
                      {staff.displayName.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {staff.displayName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {staff.title || "服務人員"}
                    </p>
                  </div>
                </div>
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
                {can("staff.manage") ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <MediaUploadButton
                      busy={isSubmitting}
                      label="更新人員照片"
                      onFile={(file) =>
                        void uploadMedia("STAFF_PHOTO", staff.id, file)
                      }
                    />
                  </div>
                ) : null}
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
      <CustomerManagement
        blacklistEnabled={data.features.customerBlacklist}
        canManage={can("customer.manage")}
        canReadSensitive={can("customer.sensitive.read")}
        currency={data.stats.currency}
        customerTags={data.customerTags}
        customers={data.customers}
        depositsEnabled={data.features.deposits}
        isSubmitting={isSubmitting}
        scope={scope}
        timezone={data.location.timezone}
        onCreateCustomer={createCustomer}
        onCreateNote={createCustomerNote}
        onCreateTag={createCustomerTag}
        onSetTag={setCustomerTag}
        onUpdateCustomer={updateCustomer}
      />
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
          action: "BOOKING_STATE",
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

    async function saveLocationProfile(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const profile = {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        address: String(form.get("address") ?? ""),
        phone: String(form.get("phone") ?? ""),
      };
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      try {
        await mutate("/api/merchant/location", "PATCH", {
          action: "PROFILE",
          ...profile,
        });
        setData((current) => ({
          ...current,
          location: { ...current.location, ...profile },
          locations: current.locations.map((item) =>
            item.id === current.location.id
              ? { ...item, ...profile }
              : item,
          ),
        }));
        setFeedback("分店資料已更新。");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "分店資料更新失敗。",
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
            className="overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            {location.coverImageUrl ? (
              <Image
                alt={`${location.name} 店外觀`}
                className="aspect-[21/7] w-full object-cover"
                height={420}
                loader={publicMediaLoader}
                src={location.coverImageUrl}
                unoptimized
                width={1260}
              />
            ) : (
              <div className="flex aspect-[21/5] items-center justify-center bg-slate-100 text-slate-400">
                <Building2 aria-hidden="true" className="h-8 w-8" />
              </div>
            )}
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{location.name}</p>
                  {location.id === data.location.id ? (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      目前分店
                    </span>
                  ) : null}
                </div>
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
            {location.id !== data.location.id ? (
              <div className="px-5 pb-5">
                <p className="mt-3 text-sm text-slate-600">
                  {location.description || "尚未填寫分店介紹"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {location.address || "尚未填寫地址"} · {location.phone || "尚未填寫電話"}
                </p>
                <Link
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal"
                  href={`/merchant/locations?organization=${encodeURIComponent(
                    data.organization.slug,
                  )}&location=${encodeURIComponent(location.slug)}`}
                >
                  切換至此分店
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
            {location.id === data.location.id &&
            can("location.manage") ? (
              <div className="px-5 pb-5">
                <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-slate-100 py-4">
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
                  <MediaUploadButton
                    busy={isSubmitting}
                    label="更新店外觀照"
                    onFile={(file) =>
                      void uploadMedia("LOCATION_COVER", location.id, file)
                    }
                  />
                </div>
                <form
                  className="mt-5 grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => void saveLocationProfile(event)}
                >
                  <Field
                    defaultValue={location.name}
                    label="分店名稱"
                    name="name"
                    required
                  />
                  <Field
                    defaultValue={location.phone}
                    label="分店電話"
                    name="phone"
                  />
                  <Field
                    defaultValue={location.address}
                    label="分店地址"
                    name="address"
                    wide
                  />
                  <label className="sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      分店介紹
                    </span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3"
                      defaultValue={location.description}
                      maxLength={1000}
                      name="description"
                    />
                  </label>
                  <SubmitButton busy={isSubmitting} />
                </form>
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
    async function saveOrganizationProfile(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const profile = {
        name: String(form.get("name") ?? ""),
        businessName: String(form.get("businessName") ?? ""),
        entityType: String(form.get("entityType")) as
          | "SOLE_PROPRIETOR"
          | "COMPANY",
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        brandDescription: String(form.get("brandDescription") ?? ""),
      };
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      try {
        await mutate("/api/merchant/organization", "PATCH", profile);
        setData((current) => ({
          ...current,
          organization: { ...current.organization, ...profile },
        }));
        setFeedback("品牌與公司資料已更新。");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "品牌資料更新失敗。",
        );
      } finally {
        setIsSubmitting(false);
      }
    }

    async function saveBookingSettings(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const settings = {
        onlineBookingEnabled: form.get("onlineBookingEnabled") === "on",
        depositsEnabled:
          data.features.deposits && form.get("depositsEnabled") === "on",
        depositMode: String(
          form.get("depositMode") ?? data.bookingSettings.depositMode,
        ) as
          | "FIXED"
          | "PERCENTAGE",
        depositAmountMinor: Math.round(
          Number(
            form.get("depositAmount") ??
              data.bookingSettings.depositAmountMinor / 100,
          ) * 100,
        ),
        depositPercentage: Number(
          form.get("depositPercentage") ??
            data.bookingSettings.depositPercentage,
        ),
        customerCancellationEnabled:
          form.get("customerCancellationEnabled") === "on",
        customerRescheduleEnabled:
          form.get("customerRescheduleEnabled") === "on",
        cancellationCutoffHours: Number(
          form.get("cancellationCutoffHours") ??
            data.bookingSettings.cancellationCutoffHours,
        ),
      };
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      try {
        await mutate("/api/merchant/settings", "PATCH", settings);
        setData((current) => ({
          ...current,
          bookingSettings: settings,
          location: {
            ...current.location,
            onlineBookingEnabled: settings.onlineBookingEnabled,
            bookingState: settings.onlineBookingEnabled ? "OPEN" : "PAUSED",
          },
          locations: current.locations.map((item) =>
            item.id === current.location.id
              ? {
                  ...item,
                  onlineBookingEnabled: settings.onlineBookingEnabled,
                  bookingState: settings.onlineBookingEnabled
                    ? "OPEN"
                    : "PAUSED",
                }
              : item,
          ),
        }));
        setFeedback("預約規則與訂金設定已更新。");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "預約設定更新失敗。",
        );
      } finally {
        setIsSubmitting(false);
      }
    }

    return (
      <div className="space-y-8">
        <section className="border-y border-slate-200 bg-white">
          {data.organization.coverImageUrl ? (
            <Image
              alt={`${data.organization.name} 品牌封面`}
              className="aspect-[21/6] w-full object-cover"
              height={360}
              loader={publicMediaLoader}
              src={data.organization.coverImageUrl}
              unoptimized
              width={1260}
            />
          ) : (
            <div className="flex aspect-[21/4] items-center justify-center bg-slate-100 text-slate-400">
              <Store aria-hidden="true" className="h-9 w-9" />
            </div>
          )}
          <div className="px-5 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {data.organization.logoUrl ? (
                  <Image
                    alt={`${data.organization.name} Logo`}
                    className="h-16 w-16 rounded-md border border-slate-200 bg-white object-cover"
                    height={64}
                    loader={publicMediaLoader}
                    src={data.organization.logoUrl}
                    unoptimized
                    width={64}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md bg-ink text-xl font-semibold text-white">
                    {data.organization.name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-ink">品牌與公司資料</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.organization.entityType === "COMPANY"
                      ? "企業戶"
                      : "個體戶"}
                    · {data.locations.length} 間分店
                  </p>
                </div>
              </div>
              {can("organization.manage") ? (
                <div className="flex flex-wrap gap-2">
                  <MediaUploadButton
                    busy={isSubmitting}
                    label="更新 Logo"
                    onFile={(file) =>
                      void uploadMedia(
                        "ORGANIZATION_LOGO",
                        data.organization.id,
                        file,
                      )
                    }
                  />
                  <MediaUploadButton
                    busy={isSubmitting}
                    label="更新品牌封面"
                    onFile={(file) =>
                      void uploadMedia(
                        "ORGANIZATION_COVER",
                        data.organization.id,
                        file,
                      )
                    }
                  />
                </div>
              ) : null}
            </div>
            {can("organization.manage") ? (
              <form
                className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"
                onSubmit={(event) => void saveOrganizationProfile(event)}
              >
                <Field
                  defaultValue={data.organization.name}
                  label="品牌名稱"
                  name="name"
                  required
                />
                <Field
                  defaultValue={data.organization.businessName}
                  label="公司／商業登記名稱"
                  name="businessName"
                  required
                />
                <label>
                  <span className="text-sm font-medium text-slate-700">
                    帳戶類型
                  </span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    defaultValue={data.organization.entityType}
                    name="entityType"
                  >
                    <option value="SOLE_PROPRIETOR">個體戶</option>
                    <option value="COMPANY">企業戶</option>
                  </select>
                </label>
                <Field
                  defaultValue={data.organization.phone}
                  label="公司電話"
                  name="phone"
                  required
                />
                <Field
                  defaultValue={data.organization.email}
                  label="公司 Email"
                  name="email"
                  required
                  type="email"
                  wide
                />
                <label className="sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">
                    品牌介紹
                  </span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-md border border-slate-300 p-3"
                    defaultValue={data.organization.brandDescription}
                    maxLength={1000}
                    name="brandDescription"
                  />
                </label>
                <SubmitButton busy={isSubmitting} />
              </form>
            ) : null}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-5 py-6">
          <div className="flex items-center gap-2">
            <BadgeDollarSign aria-hidden="true" className="h-5 w-5 text-teal" />
            <h2 className="font-semibold text-ink">預約規則與訂金</h2>
          </div>
          <form
            className="mt-5 grid gap-5 sm:grid-cols-2"
            onSubmit={(event) => void saveBookingSettings(event)}
          >
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  開放線上預約
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  關閉後顧客無法從公開頁建立新預約
                </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                defaultChecked={data.location.onlineBookingEnabled}
                disabled={!can("location.manage") || isSubmitting}
                name="onlineBookingEnabled"
                type="checkbox"
              />
            </label>
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  允許顧客自行取消
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  顧客可從安全預約連結送出取消
                </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                defaultChecked={
                  data.bookingSettings.customerCancellationEnabled
                }
                disabled={!can("location.manage") || isSubmitting}
                name="customerCancellationEnabled"
                type="checkbox"
              />
            </label>
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  允許顧客自行改期
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  已收款預約仍須由店家協助處理
                </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                defaultChecked={data.bookingSettings.customerRescheduleEnabled}
                disabled={!can("location.manage") || isSubmitting}
                name="customerRescheduleEnabled"
                type="checkbox"
              />
            </label>
            <Field
              defaultValue={String(
                data.bookingSettings.cancellationCutoffHours,
              )}
              label="免費取消期限（預約前小時）"
              max="720"
              min="0"
              name="cancellationCutoffHours"
              type="number"
            />
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  收取訂金
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {data.features.deposits
                    ? "套用分店預設規則，仍可在顧客頁個別指定"
                    : "目前方案尚未啟用訂金功能"}
                </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                defaultChecked={data.bookingSettings.depositsEnabled}
                disabled={
                  !can("location.manage") ||
                  !data.features.deposits ||
                  isSubmitting
                }
                name="depositsEnabled"
                type="checkbox"
              />
            </label>
            <label>
              <span className="text-sm font-medium text-slate-700">
                訂金方式
              </span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                defaultValue={data.bookingSettings.depositMode}
                disabled={!data.features.deposits}
                name="depositMode"
              >
                <option value="FIXED">固定金額</option>
                <option value="PERCENTAGE">服務金額比例</option>
              </select>
            </label>
            <Field
              defaultValue={String(
                data.bookingSettings.depositAmountMinor / 100,
              )}
              disabled={!data.features.deposits}
              label="固定訂金（TWD）"
              min="0"
              name="depositAmount"
              type="number"
            />
            <Field
              defaultValue={String(data.bookingSettings.depositPercentage)}
              disabled={!data.features.deposits}
              label="訂金比例（%）"
              min="0"
              name="depositPercentage"
              type="number"
            />
            {can("location.manage") ? (
              <SubmitButton busy={isSubmitting} />
            ) : null}
          </form>
        </section>

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

        <NotificationHealthPanel
          deliveries={data.notificationDeliveries}
          health={data.notificationHealth}
          integrations={data.notificationIntegrations}
          isSubmitting={isSubmitting}
          timezone={data.location.timezone}
          onRetry={retryNotification}
        />
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
          {navItems.filter(item=>(crmVisible||item.view!=="customers") && (item.view!=="operations" || initialData.capabilities.includes("staff.manage") || initialData.capabilities.includes("billing.read"))).map((item) => {
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
          className="mx-auto max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6 lg:py-8"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
            <div>
              <p className="text-xs font-semibold text-teal">
                {data.organization.name}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">
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
  max,
  wide = false,
  value,
  defaultValue,
  disabled = false,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  wide?: boolean;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-teal"
        max={max}
        min={min}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
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

function MediaUploadButton({
  busy,
  label,
  onFile,
}: {
  busy: boolean;
  label: string;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:border-teal hover:text-teal ${
        busy ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <ImagePlus aria-hidden="true" className="h-4 w-4" />
      {label}
      <input
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={busy}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </label>
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

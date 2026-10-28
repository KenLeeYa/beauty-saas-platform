"use client";

import {useLanguage} from "@/components/language-provider";
import {MerchantShell} from "@/components/merchant-shell";
import {MerchantSheet, MerchantPager} from "@/components/merchant-sheet";
import {MerchantTeam} from "./merchant-team";
import type {MerchantTeamData} from "@/server/merchant/team";
import {MerchantImage} from "./merchant-image";
import {StaffSkillPicker, SkillCatalogList} from "./staff-skill-picker";
import {useRemotePage} from "./use-remote-page";
import {MerchantReportDashboard} from "./merchant-report-dashboard";

import {
  BadgeDollarSign,
  Bell,
  Building2,
  Check,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  PackagePlus,
  PauseCircle,
  Plus,
  Rocket,
  Save,
  Store,
  TestTube2,
  Tags,
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
import type {StaffDirectoryItem} from "@/server/merchant/catalog-directory";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

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
  const {t} = useLanguage();
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
      <p className="text-xs font-medium text-slate-500">{t(label)}</p>
      <p className="mt-1 text-xl font-semibold text-ink sm:mt-2 sm:text-2xl">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:mt-1 sm:text-xs">
        {t(detail)}
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
  const {t} = useLanguage();
  return (
    <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
      <p className="font-semibold text-ink">{t(title)}</p>
      <p className="mt-2 text-sm text-slate-500">{t(body)}</p>
    </div>
  );
}

export function MerchantWorkspace({
    activeView,
    initialData,
    crmVisible,
    teamData,
  }: {
    activeView: MerchantView;
    initialData: MerchantWorkspaceData;
    crmVisible: boolean;
    teamData: MerchantTeamData;
}) {
  const {t, errorText} = useLanguage();
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [serverData, setServerData] = useState(initialData);
  // Refresh server projections without remounting the user's in-progress form.
  if (serverData !== initialData) {
    setServerData(initialData);
    setData(initialData);
  }
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
  const [formOpen, setFormOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [dayTab, setDayTab] = useState<"bookings" | "hours">("bookings");
  const [directoryPage, setDirectoryPage] = useState(0);
  const [dayPage, setDayPage] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<MerchantWorkspaceData["services"][number] | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffDirectoryItem | null>(null);
  const [category, setCategory] = useState("ALL");
  const [serviceDraft, setServiceDraft] = useState({name:"", variantName:"", categoryName:"一般服務", durationMinutes:"60", price:"", preBufferMinutes:"0", postBufferMinutes:"0", description:""});
  const [staffDraft, setStaffDraft] = useState({displayName:"", title:"", skills:[] as string[]});
  const [skillPanel,setSkillPanel]=useState(false);
  const [skillName,setSkillName]=useState("");
  const [skillRevision,setSkillRevision]=useState(0);
  const [staffSkillDrafts,setStaffSkillDrafts]=useState<Record<string,{skills:string[];expectedSkills:string[]}>>({});
  const [serviceSkillDrafts,setServiceSkillDrafts]=useState<Record<string,{skills:string[];expectedSkills:string[]}>>({});
  const [resourceDraft, setResourceDraft] = useState({name:"", typeName:"", kind:"SPA_ROOM"});
  const [resourceStatus, setResourceStatus] = useState<"active" | "all">("active");
  const [selectedLocation, setSelectedLocation] = useState<MerchantWorkspaceData["locations"][number] | null>(null);
  const [locationTab, setLocationTab] = useState("profile");
  const [locationDraft, setLocationDraft] = useState(() => ({name:initialData.location.name, phone:initialData.location.phone ?? "", address:initialData.location.address ?? "", description:initialData.location.description ?? ""}));
  const [locationStateDraft, setLocationStateDraft] = useState<"OPEN" | "PAUSED" | "CLOSED">(initialData.location.bookingState === "OPEN" ? "OPEN" : initialData.location.bookingState === "CLOSED" ? "CLOSED" : "PAUSED");
  const [settingsPanel, setSettingsPanel] = useState<"brand" | "booking" | "notifications" | null>(null);
  const [brandTab, setBrandTab] = useState("profile");
  const [bookingTab, setBookingTab] = useState("booking");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoicePage, setInvoicePage] = useState(0);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [setupGroup, setSetupGroup] = useState(() => {
    const steps = initialData.setup?.steps;
    return !steps || !steps.brand || !steps.location || !steps.service || !steps.staff || !steps.resource ? "business" : !steps.businessHours || !steps.policies || !steps.notifications ? "booking" : "launch";
  });
  const [setupPanel, setSetupPanel] = useState<string | null>(null);
  const [setupPolicyTab, setSetupPolicyTab] = useState("booking");
  const [setupHoursDraft, setSetupHoursDraft] = useState({days:[1,2,3,4,5,6], opensAt:"10:00", closesAt:"20:00"});
  const [setupPolicyDraft, setSetupPolicyDraft] = useState({slotIntervalMinutes:"30", minimumLeadMinutes:"60", maximumAdvanceDays:"60", holdMinutes:"10", cancellationCutoffHours:"24", depositMode:"FIXED", depositAmount:"500", depositPercentage:"20"});
  const [brandDraft, setBrandDraft] = useState(() => ({name:initialData.organization.name, businessName:initialData.organization.businessName, entityType:initialData.organization.entityType, phone:initialData.organization.phone, email:initialData.organization.email, brandDescription:initialData.organization.brandDescription}));
  const [bookingDraft, setBookingDraft] = useState(() => ({...initialData.bookingSettings, onlineBookingEnabled:initialData.location.onlineBookingEnabled, depositAmount:String(initialData.bookingSettings.depositAmountMinor / 100), depositPercentage:String(initialData.bookingSettings.depositPercentage), cancellationCutoffHours:String(initialData.bookingSettings.cancellationCutoffHours)}));
  const [bufferDrafts, setBufferDrafts] = useState<Record<string, {pre:string; post:string}>>({});
  const [statusChange, setStatusChange] = useState<{bookingId:string; nextStatus:string} | null>(null);
  const [statusReason, setStatusReason] = useState("");
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
  const bookingPage = useRemotePage<MerchantWorkspaceData["bookings"][number]>(activeView === "bookings" ? `/api/merchant/bookings?${scope}&limit=8&offset=${directoryPage*8}&search=${encodeURIComponent(search)}&status=${statusFilter}` : null,data.bookings);
  const visibleBookings = activeView === "bookings" ? bookingPage.data?.items ?? [] : data.bookings;
  const servicePage = useRemotePage<MerchantWorkspaceData["services"][number], {categories:string[]}>(activeView === "services" ? `/api/merchant/services?${scope}&limit=8&offset=${directoryPage*8}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}` : null, initialData);
  const staffPage = useRemotePage<StaffDirectoryItem>(activeView === "staff" ? `/api/merchant/staff?${scope}&limit=8&offset=${directoryPage*8}&search=${encodeURIComponent(search)}` : null, initialData);
  const locationPage = useRemotePage<MerchantWorkspaceData["locations"][number]>(activeView === "locations" ? `/api/merchant/location?${scope}&limit=8&offset=${directoryPage*8}&search=${encodeURIComponent(search)}` : null, initialData);
  const resourcePage = useRemotePage<MerchantWorkspaceData["resources"][number]>(activeView === "resources" ? `/api/merchant/resources?${scope}&limit=6&offset=${directoryPage*6}&search=${encodeURIComponent(search)}&status=${resourceStatus}` : null, initialData);
  const facilityPage = activeView === "locations" ? locationPage.data : activeView === "resources" ? resourcePage.data : null;
  const facilityPageSize = activeView === "resources" ? 6 : 8;
  if (facilityPage && directoryPage > Math.max(0, Math.ceil(facilityPage.total / facilityPageSize) - 1)) {
    setDirectoryPage(Math.max(0, Math.ceil(facilityPage.total / facilityPageSize) - 1));
  }
  const catalogPage = activeView === "services" ? servicePage.data : activeView === "staff" ? staffPage.data : null;
  if (catalogPage && directoryPage > Math.max(0, Math.ceil(catalogPage.total / 8) - 1)) {
    setDirectoryPage(Math.max(0, Math.ceil(catalogPage.total / 8) - 1));
  }
  const paymentConfirmationBooking = visibleBookings.find(
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
      if (kind === "LOCATION_COVER") {
        locationPage.updateItems(rows=>rows.map(row=>row.id===targetId ? {...row,coverImageUrl:url} : row),false);
        setSelectedLocation(row=>row?.id===targetId ? {...row,coverImageUrl:url} : row);
      }
      if (kind === "SERVICE_IMAGE") {
        servicePage.updateItems(rows=>rows.map(row=>row.id===targetId ? {...row,imageUrl:url} : row),false);
        setSelectedService(row=>row?.id===targetId ? {...row,imageUrl:url} : row);
      }
      if (kind === "STAFF_PHOTO") {
        staffPage.updateItems(rows=>rows.map(row=>row.id===targetId ? {...row,photoUrl:url} : row),false);
        setSelectedStaff(row=>row?.id===targetId ? {...row,photoUrl:url} : row);
      }
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
      servicePage.updateItems(rows=>rows.map(row=>row.locationServiceId===locationServiceId ? {...row,preBufferMinutes,postBufferMinutes} : row),false);
      setSelectedService(row=>row?.locationServiceId===locationServiceId ? {...row,preBufferMinutes,postBufferMinutes} : row);
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
    suppliedReason?: string,
  ): Promise<void> {
    const booking = visibleBookings.find((item) => item.id === bookingId);
    if (!booking) {
      return;
    }
    const reason = suppliedReason?.trim();
    if (
      ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(nextStatus) &&
      !reason
    ) {
      setStatusChange({bookingId,nextStatus}); setStatusReason(""); setError(null); setFeedback(null);
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
      bookingPage.updateItems(items=>items.map(item=>item.id===result.id ? {...item,status:result.status,version:result.version} : item));
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
      setStatusChange(null); setStatusReason("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "狀態更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmPayment(bookingId: string): Promise<void> {
    const booking = visibleBookings.find((item) => item.id === bookingId);
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
      bookingPage.updateItems(items=>items.map(item=>item.id===result.id ? {...item,...result} : item));
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
      if (path === "/api/merchant/services") setServiceDraft({name:"", variantName:"", categoryName:"一般服務", durationMinutes:"60", price:"", preBufferMinutes:"0", postBufferMinutes:"0", description:""});
      if (path === "/api/merchant/staff") setStaffDraft({displayName:"",title:"",skills:[]});
      if (path === "/api/merchant/resources") setResourceDraft({name:"",typeName:"",kind:"SPA_ROOM"});
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

  function renderBookingRows({
    bookings,
    compact = false,
  }: {
    bookings: MerchantWorkspaceData["bookings"];
    compact?: boolean;
  }) {
    if (bookings.length === 0) {
      return (
        <EmptyState
          title={t("目前沒有預約")}
          body={t("新預約送出後會立即顯示在這裡。")}
        />
      );
    }

    if (compact) return <div className="merchant-directory">
      {bookings.map(booking => <button type="button" key={booking.id} className="merchant-row merchant-booking-row"
        aria-label={`${t("預約詳細資料")} ${booking.customerName} ${formatLocalMonthDayTime(booking.startsAt, data.location.timezone)}`}
        onClick={()=>{setSelectedBookingId(booking.id); setError(null); setFeedback(null);}}>
        <span className="text-sm font-semibold">{formatLocalMonthDayTime(booking.startsAt,data.location.timezone).replace(" ","\n")}</span>
        <span><strong>{booking.customerName}</strong><small>{booking.serviceName} · {booking.staffName ?? t("未指定人員")}</small>
          <small>{t(statusLabels[booking.status] ?? booking.status)} · {formatMoney(booking.totalMinor,booking.currency)}</small></span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>)}
    </div>;
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
                  {t(statusLabels[booking.status] ?? booking.status)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {booking.customerName}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {booking.serviceName} · {booking.variantName} ·{" "}
                  {booking.staffName ?? t("未指定人員")}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {booking.customerPhone ?? t("未提供電話")} ·{" "}
                  {formatMoney(booking.totalMinor, booking.currency)}
                </p>
              </div>
              <div className="merchant-booking-actions flex flex-wrap gap-2 md:justify-end">
                {booking.status === "PENDING_PAYMENT" &&
                can("payment.manage") ? (
                  <button
                    className="h-9 rounded-md bg-teal px-3 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      setPaymentConfirmationId(booking.id)
                    }
                  > {t("確認訂金")} </button>
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
                  > {t("標記失效")} </button>
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
                    > {t("報到")} </button>
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
                    > {t("未到")} </button>
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
                  > {t("開始服務")} </button>
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
                  > {t("完成")} </button>
                ) : null}
                {["PENDING_PAYMENT", "CONFIRMED"].includes(
                  booking.status,
                ) && can("booking.manage") ? (
                  <button
                    aria-label={t("取消預約")}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                    disabled={isSubmitting}
                    title={t("取消預約")}
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
            detail={t("依分店時區計算")}
            label={t("今日預約")}
            value={String(data.stats.todayBookings)}
          />
          <StatCard
            accent="coral"
            detail={t("需要確認訂金")}
            label={t("待處理")}
            value={String(data.stats.pendingBookings)}
          />
          <StatCard
            accent="gold"
            detail={t("已確認與服務中")}
            label={t("進行中預約")}
            value={String(data.stats.confirmedBookings)}
          />
          <StatCard
            accent="ink"
            detail={t("本月已完成服務")}
            label={t("完成營收")}
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
              <p className="font-semibold text-ink"> {t("有新預約待確認")} </p>
              <p className="mt-1 text-sm text-slate-500">
                {data.stats.pendingBookings} {t("筆預約等待訂金或店家確認。")} </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section aria-labelledby="dashboard-calendar-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2
                id="dashboard-calendar-heading"
                className="text-lg font-semibold text-ink"
              > {t("月曆")} </h2>
              <Link
                className="text-sm font-medium text-teal hover:underline"
                href={`/merchant/calendar?${scope}`}
              > {t("開啟完整行事曆")} </Link>
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
              {selectedDate} {t("預約")} </h2>
            {renderBookingRows({bookings:dayBookings})}
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
      <div className="merchant-calendar">
        <section>
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <MonthCalendar
              audience="merchant"
              days={data.calendarDays}
              selectedDate={selectedDate}
              onSelectDate={date => {
                if (date !== selectedDate) {selectCalendarDate(date); setDayPage(0); setDayTab("bookings");}
                setError(null); setFeedback(null); setDayOpen(true);
              }}
            />
          </div>
        </section>
        <button className="merchant-calendar-summary" type="button" onClick={()=>setDayOpen(true)}>
          <span><strong>{selectedDate}</strong><small>{selectedCalendarDay?.bookedCount ?? 0} {t("筆預約")} · {t(selectedCalendarDay?.scheduleMode === "CLOSED" ? "整日關閉" : selectedCalendarDay?.scheduleMode === "CUSTOM" ? "自訂時段" : "正常營業")}</small></span>
          <ChevronRight size={20} aria-hidden="true"/>
        </button>
        <MerchantSheet open={dayOpen} onClose={()=>setDayOpen(false)} title={t("當日行程")} description={selectedDate}
          busy={isSubmitting} error={error} feedback={feedback}
          footer={dayTab === "hours" && can("location.manage") ? <button className="inline-flex items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={isSubmitting} type="button" onClick={()=>void saveDaySchedule()}><Save size={18} aria-hidden="true"/>{t(isSubmitting ? "儲存中..." : "儲存當日設定")}</button> : undefined}>
          <div className="merchant-tabs" role="group" aria-label={t("當日行程")}>
            <button type="button" aria-pressed={dayTab === "bookings"} onClick={()=>setDayTab("bookings")}>{t("當日預約")} ({dayBookings.length})</button>
            <button type="button" aria-pressed={dayTab === "hours"} onClick={()=>setDayTab("hours")}>{t("開放時段")}</button>
          </div>
          <section hidden={dayTab !== "hours"} aria-labelledby="day-schedule-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2
                  className="text-lg font-semibold text-ink"
                  id="day-schedule-heading"
                >
                  {selectedDate} {t("開放時段")} </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedCalendarDay?.bookedCount ?? 0} {t("筆預約")} </p>
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
                  ? t("整日關閉")
                  : scheduleMode === "CUSTOM"
                    ? t("自訂時段")
                    : t("每週設定")}
              </span>
            </div>

            {can("location.manage") ? (
              <fieldset disabled={isSubmitting} className="min-w-0 border-t border-slate-200 bg-white py-4">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("當日營業模式")}>
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
                      {t(label)}
                    </button>
                  ))}
                </div>

                {scheduleMode === "CUSTOM" ? (
                  <div className="mt-4 space-y-3">
                    {scheduleSegments.map((segment, index) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-end gap-2"
                        key={index}
                      >
                        <Field
                          label={`${t("時段")} ${index + 1} ${t("開始")}`}
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
                        <Field
                          label={`${t("時段")} ${index + 1} ${t("結束")}`}
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
                          aria-label={`${t("移除時段")} ${index + 1}`}
                          className="merchant-icon text-red-600"
                          disabled={scheduleSegments.length === 1}
                          title={t("移除時段")}
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
                        <Plus aria-hidden="true" className="h-4 w-4" /> {t("新增時段")} </button>
                    ) : null}
                  </div>
                ) : null}

                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700"> {t("當日備註")} </span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 outline-none focus:border-teal"
                    maxLength={240}
                    placeholder={
                      scheduleMode === "CLOSED"
                        ? t("例如：店休、教育訓練")
                        : t("例如：節日調整")
                    }
                    value={scheduleReason}
                    onChange={(event) =>
                      setScheduleReason(event.target.value)
                    }
                  />
                </label>
              </fieldset>
            ) : null}
          </section>

          <section hidden={dayTab !== "bookings"}>
            {renderBookingRows({compact:true,bookings:dayBookings.slice(dayPage * 8, (dayPage + 1) * 8)})}
            <MerchantPager page={dayPage} total={dayBookings.length} size={8} onChange={setDayPage}/>
          </section>
        </MerchantSheet>
      </div>
    );
  }

  function renderBookings(): ReactNode {
    return (
      <div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label>
            <span className="sr-only"> {t("搜尋預約")} </span>
            <input
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-4 outline-none focus:border-teal"
              placeholder={t("搜尋顧客、電話或服務")}
              value={search}
              onChange={(event) => {setSearch(event.target.value); setDirectoryPage(0);}}
            />
          </label>
          <label>
            <span className="sr-only"> {t("預約狀態")} </span>
            <select
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
              value={statusFilter}
              aria-label={t("預約狀態")}
              onChange={(event) => {setStatusFilter(event.target.value); setDirectoryPage(0);}}
            >
              <option value="ALL"> {t("全部狀態")} </option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bookingPage.loading && <p role="status">{t("載入中")}</p>}
        {bookingPage.error && <p role="alert">{errorText(bookingPage.error)} <button type="button" onClick={bookingPage.retry}>{t("重試")}</button></p>}
        {bookingPage.data && renderBookingRows({compact:true,bookings:visibleBookings})}
        {bookingPage.data && <MerchantPager page={directoryPage} total={bookingPage.data.total} size={8} onChange={setDirectoryPage}/>}
      </div>
    );
  }

  function renderServiceDetail(service: MerchantWorkspaceData["services"][number]): ReactNode {
    return (
<MerchantSheet open={true} onClose={()=>setSelectedService(null)} title={t("服務詳細資料")} description={service.name} busy={isSubmitting} error={error} feedback={feedback}
                        footer={can("catalog.manage") ? <button className="inline-flex items-center gap-2 rounded-md bg-ink px-4 text-white" form={`service-buffer-${service.locationServiceId}`} type="submit" disabled={isSubmitting}><Save size={18}/>{t("儲存服務緩衝時間")}</button> : undefined}>
                      <MerchantImage src={service.imageUrl} alt={`${service.name} ${t("服務圖片")}`} label={t("上傳服務圖片")} busy={isSubmitting}
                        onFile={can("catalog.manage") ? file=>void uploadMedia("SERVICE_IMAGE",service.id,file) : undefined}/>
                      <div className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">
                              {service.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {service.variantName} · {service.durationMinutes}{" "} {t("分鐘")} </p>
                          </div>
                          {can("catalog.manage") ? (
                            <button
                              aria-label={t("線上預約")}
                              aria-checked={service.onlineBookingEnabled} role="switch"
                              className="relative h-11 w-11 shrink-0"
                              title={t(service.onlineBookingEnabled ? "關閉線上預約" : "開啟線上預約")}
                              disabled={isSubmitting}
                              type="button"
                              onClick={async () => {
                                setIsSubmitting(true); setError(null); setFeedback(null);
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
                                  servicePage.updateItems(rows=>rows.map(row=>row.locationServiceId===service.locationServiceId ? {...row,onlineBookingEnabled:!service.onlineBookingEnabled} : row),false);
                                  setSelectedService({...service,onlineBookingEnabled:!service.onlineBookingEnabled});
                                } catch (cause) {
                                  setError(
                                    cause instanceof Error
                                      ? cause.message
                                      : "設定失敗。",
                                  );
                                } finally {setIsSubmitting(false);}
                              }}
                            >
                              <span className={`absolute inset-x-0 top-2.5 h-6 rounded-full ${service.onlineBookingEnabled ? "bg-teal" : "bg-slate-300"}`}><span
                                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                                  service.onlineBookingEnabled
                                    ? "left-6"
                                    : "left-1"
                                }`}
                              /></span>
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
                            {service.staffCount} {t("位服務人員可承接")} </p>
                        </div>
                        <section className="merchant-service-skills">
                          <StaffSkillPicker label="服務所需技能" scope={scope}
                            value={serviceSkillDrafts[service.locationServiceId]?.skills ?? service.requiredSkills}
                            disabled={isSubmitting || !can("catalog.manage")}
                            onChange={skills=>setServiceSkillDrafts(current=>({...current,[service.locationServiceId]:{skills,expectedSkills:current[service.locationServiceId]?.expectedSkills ?? service.requiredSkills}}))}/>
                          <p className="mt-2 text-xs text-slate-500">{t("需具備全部所選技能；未選擇時沿用既有服務授權。")}</p>
                          {can("catalog.manage") && <button type="button" className="merchant-skill-save" disabled={isSubmitting} onClick={async()=>{
                            setIsSubmitting(true);setError(null);setFeedback(null);
                            try {
                              const draft=serviceSkillDrafts[service.locationServiceId] ?? {skills:service.requiredSkills,expectedSkills:service.requiredSkills};
                              const result=await mutate<{skills:string[];pendingReviewCount:number}>("/api/merchant/services","PATCH",{action:"UPDATE_SKILLS",locationServiceId:service.locationServiceId,...draft});
                              setServiceSkillDrafts(current=>({...current,[service.locationServiceId]:{skills:result.skills,expectedSkills:result.skills}}));
                              servicePage.updateItems(rows=>rows.map(row=>row.locationServiceId===service.locationServiceId ? {...row,requiredSkills:result.skills} : row));
                              setSelectedService({...service,requiredSkills:result.skills});
                              setFeedback(result.pendingReviewCount ? "技能已儲存，請確認待處理的預約改派。" : "服務技能已儲存。");router.refresh();
                            } catch(cause) {setError(cause instanceof Error ? cause.message : "設定失敗。");}
                            finally {setIsSubmitting(false);}
                          }}><Save size={18} aria-hidden="true"/>{t("儲存服務技能")}</button>}
                          <h3 className="mt-4 text-sm font-semibold">{t("目前可承接人員")}</h3>
                          <p className="mt-1 text-sm text-slate-600">{service.eligibleStaff.map(staff=>staff.name).join("、") || t("暫無符合資格的人員")}</p>
                        </section>
                        {can("catalog.manage") ? (
                          <form id={`service-buffer-${service.locationServiceId}`}
                            className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-slate-100 pt-4"
                            onSubmit={(event) =>
                              void updateServiceBuffers(
                                event,
                                service.locationServiceId,
                              )
                            }
                          >
                            <label className="min-w-0">
                              <span className="block text-xs font-medium text-slate-500"> {t("前置緩衝")} </span>
                              <input
                                className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                                value={bufferDrafts[service.locationServiceId]?.pre ?? String(service.preBufferMinutes)}
                                onChange={event=>setBufferDrafts(current=>({...current,[service.locationServiceId]:{pre:event.target.value,post:current[service.locationServiceId]?.post ?? String(service.postBufferMinutes)}}))}
                                disabled={isSubmitting}
                                max="240"
                                min="0"
                                name="preBufferMinutes"
                                type="number"
                              />
                            </label>
                            <label className="min-w-0">
                              <span className="block text-xs font-medium text-slate-500"> {t("後置緩衝")} </span>
                              <input
                                className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm"
                                value={bufferDrafts[service.locationServiceId]?.post ?? String(service.postBufferMinutes)}
                                onChange={event=>setBufferDrafts(current=>({...current,[service.locationServiceId]:{post:event.target.value,pre:current[service.locationServiceId]?.pre ?? String(service.preBufferMinutes)}}))}
                                disabled={isSubmitting}
                                max="240"
                                min="0"
                                name="postBufferMinutes"
                                type="number"
                              />
                            </label>
                          </form>
                        ) : (
                          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"> {t("前置")} {service.preBufferMinutes} {t("分鐘 · 後置")} {" "}
                            {service.postBufferMinutes} {t("分鐘")} </p>
                        )}
                      </div>
                      </MerchantSheet>
    );
  }

  function renderServices(): ReactNode {
    const matches = servicePage.data?.items ?? [];
    const serviceGroups = new Map<
      string,
      MerchantWorkspaceData["services"]
    >();
    for (const service of matches) {
      const groupName = service.categoryName ?? "未分類";
      serviceGroups.set(groupName, [
        ...(serviceGroups.get(groupName) ?? []),
        service,
      ]);
    }
    return (
      <div>
        <div className="merchant-toolbar">
          <input maxLength={100} aria-label={t("搜尋服務")} placeholder={t("搜尋服務")} value={search} onChange={event=>{setSearch(event.target.value); setDirectoryPage(0);}}/>
          {can("catalog.manage") ? (
            <button
              className="merchant-icon merchant-add"
              aria-label={t("新增服務")} title={t("新增服務")}
              type="button"
              onClick={() => {setError(null); setFeedback(null); setFormOpen(true);}}
            >
              <Plus aria-hidden="true" size={20} />
            </button>
          ) : null}
        </div>
        <label className="mb-4 block"><span className="sr-only">{t("服務群組")}</span>
          <select aria-label={t("服務群組")} className="merchant-filter" value={category} onChange={event=>{setCategory(event.target.value); setDirectoryPage(0);}}>
            <option value="ALL">{t("所有服務群組")}</option>
            {[...new Set([...(servicePage.data?.categories ?? []),...(category !== "ALL" ? [category] : [])])].map(name=><option key={name} value={name}>{name === "未分類" ? t("未分類") : name}</option>)}
          </select>
        </label>
        <MerchantSheet open={formOpen} onClose={()=>setFormOpen(false)} title={t("新增服務")} busy={isSubmitting} error={error}
          footer={<button className="rounded-md bg-ink px-5 text-white" form="merchant-service-create" disabled={isSubmitting} type="submit">{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
          <form
            id="merchant-service-create" className="merchant-sheet-form" inert={isSubmitting}
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
            <Field name="name" label={t("服務名稱")} required value={serviceDraft.name} onChange={name=>setServiceDraft(current=>({...current,name}))}/>
            <Field name="variantName" label={t("規格名稱")} required value={serviceDraft.variantName} onChange={variantName=>setServiceDraft(current=>({...current,variantName}))}/>
            <Field
              name="categoryName"
              label={t("服務群組")}
              value={serviceDraft.categoryName} onChange={categoryName=>setServiceDraft(current=>({...current,categoryName}))}
              required
            />
            <Field
              name="durationMinutes"
              value={serviceDraft.durationMinutes} onChange={durationMinutes=>setServiceDraft(current=>({...current,durationMinutes}))}
              label={t("服務分鐘")}
              min="15"
              required
              type="number"
            />
            <Field
              name="price"
              value={serviceDraft.price} onChange={price=>setServiceDraft(current=>({...current,price}))}
              label={t("價格（TWD）")}
              min="0"
              required
              type="number"
            />
            <Field
              value={serviceDraft.preBufferMinutes} onChange={preBufferMinutes=>setServiceDraft(current=>({...current,preBufferMinutes}))}
              label={t("服務前緩衝（分鐘）")}
              max="240"
              min="0"
              name="preBufferMinutes"
              type="number"
            />
            <Field
              value={serviceDraft.postBufferMinutes} onChange={postBufferMinutes=>setServiceDraft(current=>({...current,postBufferMinutes}))}
              label={t("服務後緩衝（分鐘）")}
              max="240"
              min="0"
              name="postBufferMinutes"
              type="number"
            />
            <label>
              <span className="text-sm font-medium text-slate-700"> {t("說明")} </span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border border-slate-300 p-3"
                name="description"
                value={serviceDraft.description} onChange={event=>setServiceDraft(current=>({...current,description:event.target.value}))}
              />
            </label>
          </form>
        </MerchantSheet>
        {selectedService && renderServiceDetail(servicePage.data?.items.find(row=>row.locationServiceId===selectedService.locationServiceId) ?? selectedService)}
        {servicePage.error && <div role="alert" className="merchant-error">{errorText(servicePage.error)} <button type="button" className="merchant-icon" onClick={servicePage.retry}>{t("重試")}</button></div>}
        {(!servicePage.data || servicePage.loading) && !servicePage.error && <p role="status" className="py-4 text-sm text-slate-500">{t("載入中")}</p>}
        {servicePage.data && !servicePage.error && matches.length === 0 ? (
          <EmptyState
            title={t(search || category !== "ALL" ? "沒有符合的結果" : "尚未建立服務")}
            body={t(search || category !== "ALL" ? "請調整搜尋條件" : "新增服務後即可安排人員並開放線上預約。")}
          />
        ) : (
          <div className="space-y-4">
            {[...serviceGroups.entries()].map(([groupName, services]) => (
              <section aria-label={`${groupName} ${t("服務群組")}`} key={groupName}>
                <div className="mb-3 flex items-center gap-2">
                  <PackagePlus
                    aria-hidden="true"
                    className="h-4 w-4 text-teal"
                  />
                  <h2 className="font-semibold text-ink">{groupName === "未分類" ? t("未分類") : groupName}</h2>
                  <span className="text-xs text-slate-400">
                    {services.length} {t("項")} </span>
                </div>
                <div className="merchant-directory">
                  {services.map((service) => (
                    <article
                      key={service.locationServiceId}
                      className="min-w-0"
                    >
                      <button className="merchant-row" type="button" aria-label={`${t("服務詳細資料")} ${service.name} ${service.variantName}`}
                        onClick={()=>{setSelectedService(service); setServiceSkillDrafts(current=>current[service.locationServiceId] ? current : {...current,[service.locationServiceId]:{skills:service.requiredSkills,expectedSkills:service.requiredSkills}}); setError(null); setFeedback(null);}}>
                        {service.imageUrl ? <Image alt="" width={48} height={48} loader={publicMediaLoader} unoptimized src={service.imageUrl}/> : <span className="merchant-avatar"><ImagePlus size={20} aria-hidden="true"/></span>}
                        <span><strong>{service.name}</strong><small>{service.variantName} · {service.durationMinutes} {t("分鐘")}</small></span>
                        <span className="merchant-row-meta">{formatMoney(service.priceMinor,data.stats.currency)}<small>{t(service.onlineBookingEnabled ? "開放預約" : "暫停預約")}</small></span>
                        <ChevronRight size={18} aria-hidden="true"/>
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {servicePage.data && <MerchantPager page={directoryPage} total={servicePage.data.total} size={8} onChange={setDirectoryPage}/>}
      </div>
    );
  }

  function renderStaffDetail(staff: StaffDirectoryItem): ReactNode {
    return (
<MerchantSheet open={true} onClose={()=>setSelectedStaff(null)} title={t("人員詳細資料")} description={staff.displayName} busy={isSubmitting} error={error} feedback={feedback}
                  footer={can("staff.manage") && <button type="button" className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting} onClick={async()=>{
                    setIsSubmitting(true);setError(null);setFeedback(null);
                    try{const draft=staffSkillDrafts[staff.id] ?? {skills:staff.skills,expectedSkills:staff.skills};
                      const result=await mutate<{skills:string[];pendingReviewCount:number}>("/api/merchant/staff/skills","PATCH",{staffId:staff.id,...draft});
                      setStaffSkillDrafts(current=>({...current,[staff.id]:{skills:result.skills,expectedSkills:result.skills}}));
                      staffPage.updateItems(rows=>rows.map(row=>row.id===staff.id ? {...row,skills:result.skills} : row));
                      setSelectedStaff({...staff,skills:result.skills});
                      setFeedback(result.pendingReviewCount ? "技能已儲存，請確認待處理的預約改派。" : "技能已儲存。");router.refresh();
                    }catch(cause){setError(cause instanceof Error ? cause.message : "設定失敗。");}
                    finally{setIsSubmitting(false);}
                  }}>{t("儲存技能")}</button>}>
                <div className="flex items-start gap-3">
                  <MerchantImage src={staff.photoUrl} alt={`${staff.displayName} ${t("照片")}`} label={t("更新人員照片")} square busy={isSubmitting} onFile={can("staff.manage") ? file=>void uploadMedia("STAFF_PHOTO",staff.id,file) : undefined}/>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {staff.displayName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {staff.title || t("服務人員")}
                    </p>
                  </div>
                </div>
                {can("staff.manage") ? <StaffSkillPicker scope={scope} value={staffSkillDrafts[staff.id]?.skills ?? staff.skills} disabled={isSubmitting}
                  onChange={skills=>setStaffSkillDrafts(current=>({...current,[staff.id]:{skills,expectedSkills:current[staff.id]?.expectedSkills ?? staff.skills}}))}/> : <div className="mt-3 flex flex-wrap gap-1.5">
                  {staff.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"
                    >
                      {skill}
                    </span>
                  ))}
                </div>}
                </MerchantSheet>
    );
  }

  function renderStaff(): ReactNode {
    const matches = staffPage.data?.items ?? [];
    return (
      <div>
        <div className="merchant-toolbar merchant-staff-toolbar">
          <input maxLength={100} aria-label={t("搜尋服務人員")} placeholder={t("搜尋服務人員")} value={search} onChange={event=>{setSearch(event.target.value); setDirectoryPage(0);}}/>
          {can("staff.manage") && <button className="merchant-icon merchant-add" type="button" title={t("新增服務人員")} aria-label={t("新增服務人員")} onClick={()=>{setError(null); setFeedback(null); setFormOpen(true);}}><Plus size={20}/></button>}
          {can("staff.manage") && <button className="merchant-icon" type="button" title={t("技能項目")} aria-label={t("技能項目")} onClick={()=>{setSkillPanel(true);setError(null);setFeedback(null);}}><Tags size={20} aria-hidden="true"/></button>}
        </div>
        <MerchantSheet open={skillPanel} onClose={()=>setSkillPanel(false)} title={t("技能項目")} busy={isSubmitting} error={error} feedback={feedback}
          footer={<button type="submit" form="merchant-skill-create" disabled={isSubmitting} className="rounded-md bg-ink px-5 text-white">{t("新增技能")}</button>}>
          <form id="merchant-skill-create" className="merchant-sheet-form" onSubmit={async event=>{
            event.preventDefault();setIsSubmitting(true);setError(null);setFeedback(null);
            try {await mutate<{id:string;name:string}>("/api/merchant/staff/skills","POST",{name:skillName});
              setSkillRevision(value=>value+1);setSkillName("");setFeedback("技能已新增。");
            } catch(cause){setError(cause instanceof Error ? cause.message : "建立資料失敗。");}
            finally{setIsSubmitting(false);}
          }}><Field name="skillName" label={t("技能名稱")} required value={skillName} onChange={setSkillName} disabled={isSubmitting}/></form>
          <SkillCatalogList scope={scope} revision={skillRevision}/>
        </MerchantSheet>
        <MerchantSheet open={formOpen} onClose={()=>setFormOpen(false)} title={t("新增服務人員")} busy={isSubmitting} error={error}
          footer={<button className="rounded-md bg-ink px-5 text-white" form="merchant-staff-create" disabled={isSubmitting} type="submit">{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
          <form
            id="merchant-staff-create" className="merchant-sheet-form" inert={isSubmitting}
            onSubmit={(event) =>
              void submitForm(event, "/api/merchant/staff", (form) => ({
                displayName: form.get("displayName"),
                title: form.get("title"),
                skills: staffDraft.skills,
              }))
            }
          >
            <Field name="displayName" label={t("顯示名稱")} required value={staffDraft.displayName} onChange={displayName=>setStaffDraft(current=>({...current,displayName}))}/>
            <Field name="title" label={t("職稱")} value={staffDraft.title} onChange={title=>setStaffDraft(current=>({...current,title}))}/>
            <StaffSkillPicker scope={scope} value={staffDraft.skills} onChange={skills=>setStaffDraft(current=>({...current,skills}))} disabled={isSubmitting}/>
          </form>
        </MerchantSheet>
        {selectedStaff && renderStaffDetail(staffPage.data?.items.find(row=>row.id===selectedStaff.id) ?? selectedStaff)}
        {staffPage.error && <div role="alert" className="merchant-error">{errorText(staffPage.error)} <button type="button" className="merchant-icon" onClick={staffPage.retry}>{t("重試")}</button></div>}
        {(!staffPage.data || staffPage.loading) && !staffPage.error && <p role="status" className="py-4 text-sm text-slate-500">{t("載入中")}</p>}
        {staffPage.data && !staffPage.error && matches.length === 0 ? (
          <EmptyState
            title={t(search ? "沒有符合的結果" : "尚未建立服務人員")}
            body={t(search ? "請調整搜尋條件" : "建立人員後會自動套用分店營業時間與現有服務。")}
          />
        ) : (
          <div className="merchant-person-grid">
            {matches.map((staff) => (
              <article
                key={staff.id}
                className="min-w-0"
              >
                <button className="merchant-person-card" type="button" aria-label={`${t("人員詳細資料")} ${staff.displayName}`} onClick={()=>{setSelectedStaff(staff); setStaffSkillDrafts(current=>current[staff.id] ? current : {...current,[staff.id]:{skills:staff.skills,expectedSkills:staff.skills}}); setError(null); setFeedback(null);}}>
                  <span className="merchant-person-heading">
                  {staff.photoUrl ? <Image alt="" width={48} height={48} loader={publicMediaLoader} unoptimized src={staff.photoUrl}/> : <span className="merchant-avatar">{staff.displayName.slice(0,1)}</span>}
                  <span className="merchant-person-identity"><strong>{staff.displayName}</strong><small>{staff.title || t("服務人員")}</small></span>
                  <ChevronRight size={18} aria-hidden="true"/>
                  </span>
                  <span className="merchant-person-tags">{staff.skills.slice(0,3).map(skill=><span key={skill}>{skill}</span>)}{staff.skills.length>3 && <span>+{staff.skills.length-3}</span>}{!staff.skills.length && <span>{t("尚未設定技能")}</span>}</span>
                  <span className="merchant-person-foot"><span>{t("可承接服務")} <strong>{staff.eligibleServiceCount}</strong></span><span>{t(staff.isActive ? "使用中" : "已停用")}</span></span>
                </button>
              </article>
            ))}
          </div>
        )}
        {staffPage.data && <MerchantPager page={directoryPage} total={staffPage.data.total} size={8} onChange={setDirectoryPage}/>}
      </div>
    );
  }

  function renderResources(): ReactNode {
    const kinds: Record<string,string> = {SPA_ROOM:"療程室",CHAIR:"座椅",NAIL_TABLE:"美甲桌",EYELASH_BED:"美睫床",EQUIPMENT:"設備",OTHER:"其他"};
    const resources = resourcePage.data?.items ?? [];
    return (
      <div>
        <div className="merchant-toolbar">
          <input maxLength={100} aria-label={t("搜尋空間與設備")} placeholder={t("搜尋空間與設備")} className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3" value={search} onChange={event=>{setSearch(event.target.value);setDirectoryPage(0);}} />
          {can("resource.manage") && <button type="button" className="merchant-icon merchant-add" title={t("新增空間或設備")} aria-label={t("新增空間或設備")} onClick={()=>{setFormOpen(true);setError(null);setFeedback(null);}}><Plus aria-hidden="true" className="h-5 w-5"/></button>}
        </div>
        <div className="merchant-section-tabs" aria-label={t("空間與設備")}>
          <button type="button" aria-pressed={resourceStatus === "active"} onClick={()=>{setResourceStatus("active");setDirectoryPage(0);}}>{t("使用中")}</button>
          <button type="button" aria-pressed={resourceStatus === "all"} onClick={()=>{setResourceStatus("all");setDirectoryPage(0);}}>{t("全部")}</button>
        </div>
        <MerchantSheet open={formOpen} onClose={()=>setFormOpen(false)} title={t("新增空間或設備")} busy={isSubmitting} error={error} feedback={feedback}
          footer={<button type="submit" form="merchant-resource-form" className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting}>{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
          <form
            id="merchant-resource-form" className="merchant-sheet-form"
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
            <Field name="name" label={t("資源名稱")} value={resourceDraft.name} onChange={name=>setResourceDraft(current=>({...current,name}))} disabled={isSubmitting} required />
            <Field name="typeName" label={t("類型名稱")} value={resourceDraft.typeName} onChange={typeName=>setResourceDraft(current=>({...current,typeName}))} disabled={isSubmitting} required />
            <label>
              <span className="text-sm font-medium text-slate-700"> {t("資源種類")} </span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                name="kind"
                aria-label={t("資源種類")} disabled={isSubmitting} value={resourceDraft.kind} onChange={event=>setResourceDraft(current=>({...current,kind:event.target.value}))}
              >
                <option value="SPA_ROOM"> {t("療程室")} </option>
                <option value="CHAIR"> {t("座椅")} </option>
                <option value="NAIL_TABLE"> {t("美甲桌")} </option>
                <option value="EYELASH_BED"> {t("美睫床")} </option>
                <option value="EQUIPMENT"> {t("設備")} </option>
                <option value="OTHER"> {t("其他")} </option>
              </select>
            </label>
          </form>
        </MerchantSheet>
        {resourcePage.error && <div role="alert" className="merchant-error">{errorText(resourcePage.error)} <button type="button" className="merchant-icon" onClick={resourcePage.retry}>{t("重試")}</button></div>}
        {(!resourcePage.data || resourcePage.loading) && !resourcePage.error && <p role="status" className="py-4 text-sm text-slate-500">{t("載入中")}</p>}
        {resourcePage.data && !resourcePage.error && resources.length === 0 ? (
          <EmptyState
            title={search || resourceStatus === "active" ? "沒有符合條件的資料" : "尚未建立資源"}
            body={search ? "請調整搜尋條件" : "療程室、床位或設備可用於避免同時重複預約。"}
          />
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
            {resources.map((resource) => (
              <article
                key={resource.id}
                className="merchant-resource-row"
              >
                <div>
                  <p className="font-semibold text-ink">{resource.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {resource.typeName} · {t(kinds[resource.kind] ?? "其他")}
                  </p>
                </div>
                <span className={`text-xs font-semibold ${resource.isActive ? "text-teal" : "text-slate-500"}`}>
                  {resource.isActive ? t("使用中") : t("已停用")}
                </span>
              </article>
            ))}
          </div>
        )}
        {resourcePage.data && <MerchantPager page={directoryPage} total={resourcePage.data.total} size={6} onChange={setDirectoryPage}/>}
      </div>
    );
  }

  function renderCustomers(): ReactNode {
    return (
      <CustomerManagement
        feedback={feedback}
        error={error}
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
    const filtered = locationPage.data?.items ?? [];
    const selected = filtered.find(item=>item.id===selectedLocation?.id) ?? selectedLocation;
    const stateLabel = (state:string) => t(state === "OPEN" ? "開放預約" : state === "PAUSED" ? "暫停預約" : "關閉");
    async function updateLocation(
      bookingState: "OPEN" | "PAUSED" | "CLOSED",
      onlineBookingEnabled: boolean,
    ): Promise<void> {
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      try {
        await mutate("/api/merchant/location", "PATCH", {
          action: "BOOKING_STATE",
          bookingState,
          onlineBookingEnabled,
        });
        locationPage.updateItems(rows=>rows.map(row=>row.id===data.location.id ? {...row,bookingState,onlineBookingEnabled} : row));
        setSelectedLocation(row=>row?.id===data.location.id ? {...row,bookingState,onlineBookingEnabled} : row);
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
        locationPage.updateItems(rows=>rows.map(row=>row.id===data.location.id ? {...row,...profile} : row));
        setSelectedLocation(row=>row?.id===data.location.id ? {...row,...profile} : row);
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
        <input maxLength={100} aria-label={t("搜尋分店")} placeholder={t("搜尋分店")} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3" value={search} onChange={event=>{setSearch(event.target.value);setDirectoryPage(0);}}/>
        {locationPage.error && <div role="alert" className="merchant-error">{errorText(locationPage.error)} <button type="button" className="merchant-icon" onClick={locationPage.retry}>{t("重試")}</button></div>}
        {(!locationPage.data || locationPage.loading) && !locationPage.error && <p role="status" className="py-4 text-sm text-slate-500">{t("載入中")}</p>}
        <div className="merchant-directory">
          {filtered.map(location=><button key={location.id} type="button" className="merchant-row" onClick={()=>{setSelectedLocation(location);setError(null);setFeedback(null);}}>
            {location.coverImageUrl ? <Image alt="" className="h-12 w-12 rounded-md object-cover" src={location.coverImageUrl} loader={publicMediaLoader} unoptimized width={48} height={48}/> : <Building2 aria-hidden="true" className="h-6 w-6 text-teal"/>}
            <span className="min-w-0"><strong className="block break-words">{location.name}</strong><span className="merchant-row-meta">{location.id === data.location.id ? t("目前分店") : location.code} · {stateLabel(location.bookingState)}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5"/>
          </button>)}
        </div>
        {locationPage.data && !locationPage.error && filtered.length === 0 && <p className="py-5 text-sm text-slate-500">{t("沒有符合條件的資料")}</p>}
        {locationPage.data && <MerchantPager page={directoryPage} total={locationPage.data.total} size={8} onChange={setDirectoryPage}/>}
        <MerchantSheet open={!!selected} onClose={()=>setSelectedLocation(null)} title={t("分店資料")} description={selected?.name} busy={isSubmitting} error={error} feedback={feedback}
          footer={selected?.id === data.location.id && can("location.manage") && <button type={locationTab === "profile" ? "submit" : "button"} form={locationTab === "profile" ? "merchant-location-form" : undefined} className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting} onClick={locationTab === "booking" ? ()=>void updateLocation(locationStateDraft,locationStateDraft !== "CLOSED") : undefined}>{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
        {(selected ? [selected] : []).map((location) => (
          <article
            key={location.id}
            className="min-w-0"
          >
            <MerchantImage src={location.coverImageUrl} alt={`${location.name} ${t("店外觀")}`} label={t("更新店外觀照")} busy={isSubmitting}
              onFile={location.id === data.location.id && can("location.manage") ? file=>void uploadMedia("LOCATION_COVER",location.id,file) : undefined}/>
            <div className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{location.name}</p>
                  {location.id === data.location.id ? (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"> {t("目前分店")} </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-500"> {t("代碼")} {location.code} · {location.slug}
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
                  ? t("開放預約")
                  : location.bookingState === "PAUSED"
                    ? t("暫停預約")
                    : t("關閉")}
              </span>
            </div>
            {location.id !== data.location.id ? (
              <div className="px-5 pb-5">
                <p className="mt-3 text-sm text-slate-600">
                  {location.description || t("尚未填寫分店介紹")}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {location.address || t("尚未填寫地址")} · {location.phone || t("尚未填寫電話")}
                </p>
                <Link
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal"
                  href={`/merchant/locations?organization=${encodeURIComponent(
                    data.organization.slug,
                  )}&location=${encodeURIComponent(location.slug)}`}
                > {t("切換至此分店")} <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
            {location.id === data.location.id &&
            !can("location.manage") ? (
              <div className="space-y-2 break-words text-sm text-slate-600">
                <p>{location.description || t("尚未填寫分店介紹")}</p>
                <p>{location.address || t("尚未填寫地址")}</p>
                <p>{location.phone || t("尚未填寫電話")}</p>
              </div>
            ) : null}
            {location.id === data.location.id &&
            can("location.manage") ? (
              <div>
                <div className="merchant-section-tabs" aria-label={t("分店資料")}>
                  <button type="button" aria-pressed={locationTab === "profile"} onClick={()=>setLocationTab("profile")}>{t("基本資料")}</button>
                  <button type="button" aria-pressed={locationTab === "booking"} onClick={()=>setLocationTab("booking")}>{t("預約狀態")}</button>
                </div>
                <div hidden={locationTab !== "booking"} className="merchant-state-options">
                  <button
                    className="h-10 rounded-md bg-teal px-4 text-sm font-semibold text-white"
                    disabled={isSubmitting}
                    type="button"
                    aria-pressed={locationStateDraft === "OPEN"} onClick={() => setLocationStateDraft("OPEN")}
                  > {t("開放")} </button>
                  <button
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-ink"
                    disabled={isSubmitting}
                    type="button"
                    aria-pressed={locationStateDraft === "PAUSED"} onClick={() => setLocationStateDraft("PAUSED")}
                  > {t("暫停")} </button>
                  <button
                    className="h-10 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700"
                    disabled={isSubmitting}
                    type="button"
                    aria-pressed={locationStateDraft === "CLOSED"} onClick={() => setLocationStateDraft("CLOSED")}
                  > {t("關閉")} </button>
                </div>
                <form
                  id="merchant-location-form" hidden={locationTab !== "profile"} className="merchant-sheet-form mt-4"
                  onSubmit={(event) => void saveLocationProfile(event)}
                >
                  <Field
                    value={locationDraft.name} onChange={name=>setLocationDraft(current=>({...current,name}))} disabled={isSubmitting}
                    label={t("分店名稱")}
                    name="name"
                    required
                  />
                  <Field
                    value={locationDraft.phone} onChange={phone=>setLocationDraft(current=>({...current,phone}))} disabled={isSubmitting} type="tel"
                    label={t("分店電話")}
                    name="phone"
                  />
                  <Field
                    value={locationDraft.address} onChange={address=>setLocationDraft(current=>({...current,address}))} disabled={isSubmitting}
                    label={t("分店地址")}
                    name="address"
                    wide
                  />
                  <label className="sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700"> {t("分店介紹")} </span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3"
                      value={locationDraft.description} onChange={event=>setLocationDraft(current=>({...current,description:event.target.value}))} disabled={isSubmitting} aria-label={t("分店介紹")}
                      maxLength={1000}
                      name="description"
                    />
                  </label>
                </form>
              </div>
            ) : null}
          </article>
        ))}
        </MerchantSheet>
      </div>
    );
  }

  function renderReports(): ReactNode {
    return <MerchantReportDashboard data={data}/>;
  }

  function renderPlan(): ReactNode {
    const subscription = data.subscription;
    const invoices = data.invoices.filter(invoice=>invoiceFilter==="all" || (["ISSUED","OVERDUE"].includes(invoice.status) && invoice.amountPaidMinor<invoice.totalMinor));
    const page = Math.min(invoicePage, Math.max(0,Math.ceil(invoices.length/6)-1));
    const selected = data.invoices.find(invoice=>invoice.id===selectedInvoiceId);
    return <div className="merchant-business">
      <section className="merchant-plan-summary" aria-label={t("目前方案")}>
        <div className="min-w-0"><p className="text-xs text-slate-500">{t("目前方案")}</p><h2 className="mt-1 text-lg font-semibold text-ink">{subscription?.planName ?? t("尚未啟用")}</h2></div>
        <span className="merchant-state-badge">{t(subscription?.status ?? "無訂閱")}</span>
        {subscription?.periodEnd && <p className="merchant-plan-period">{t("本期至")} {formatLocalDate(subscription.periodEnd,data.location.timezone)}</p>}
      </section>
      {activeView === "subscription" ? <>
        <div className="merchant-directory">
          <button className="merchant-row" type="button" aria-label={t("方案權益")} onClick={()=>setPlanOpen(true)}><BadgeDollarSign aria-hidden="true" size={22}/><span><strong>{t("方案權益")}</strong><small>{t("目前功能狀態")}</small></span><ChevronRight aria-hidden="true" size={20}/></button>
          <Link className="merchant-row" href={`/merchant/billing?${scope}`}><Building2 aria-hidden="true" size={22}/><span><strong>{t("帳單紀錄")}</strong><small>{data.invoices.length} {t("筆帳單")}</small></span><ChevronRight aria-hidden="true" size={20}/></Link>
        </div>
        <MerchantSheet open={planOpen} onClose={()=>setPlanOpen(false)} title={t("方案權益")} busy={false}>
          <dl className="merchant-detail-list">
            {([["訂金功能",data.features.deposits],["顧客黑名單",data.features.customerBlacklist]] as const).map(([label,enabled])=><div key={label}><dt>{t(label)}</dt><dd>{t(enabled ? "已啟用" : "未啟用")}</dd></div>)}
          </dl>
        </MerchantSheet>
      </> : <>
        <div className="merchant-section-tabs" aria-label={t("帳單篩選")}>
          {([["all","全部帳單"],["unpaid","待繳帳單"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={invoiceFilter===key} onClick={()=>{setInvoiceFilter(key);setInvoicePage(0);}}>{t(label)}</button>)}
        </div>
        <div className="merchant-directory" aria-label={t("帳單紀錄")}>
          {invoices.slice(page*6,(page+1)*6).map(invoice=><button key={invoice.id} className="merchant-row merchant-invoice-row" type="button" onClick={()=>setSelectedInvoiceId(invoice.id)}>
            <span><strong>{invoice.number}</strong><small>{t(invoice.status)}{invoice.dueAt ? ` · ${t("繳款期限")} ${formatLocalDate(invoice.dueAt,data.location.timezone)}` : ""}</small></span>
            <span className="merchant-invoice-amount">{formatMoney(invoice.totalMinor,invoice.currency)}</span><ChevronRight aria-hidden="true" size={20}/>
          </button>)}
          {!invoices.length && <p className="p-5 text-sm text-slate-500">{t(invoiceFilter==="all" ? "目前沒有帳單。" : "目前沒有待繳帳單。")}</p>}
        </div>
        <MerchantPager page={page} total={invoices.length} size={6} onChange={setInvoicePage}/>
        <MerchantSheet open={Boolean(selected)} onClose={()=>setSelectedInvoiceId(null)} title={t("帳單明細")} description={selected?.number} busy={false}>
          {selected && <dl className="merchant-detail-list">
            {[
              ["帳單",selected.number],["狀態",t(selected.status)],
              ["總額",formatMoney(selected.totalMinor,selected.currency)],
              ["已付",formatMoney(selected.amountPaidMinor,selected.currency)],
              ["待繳金額",["ISSUED","OVERDUE"].includes(selected.status) ? formatMoney(Math.max(0,selected.totalMinor-selected.amountPaidMinor),selected.currency) : t("不適用")],
              ["繳款期限",selected.dueAt ? formatLocalDate(selected.dueAt,data.location.timezone) : t("未設定")],
              ["建立日期",formatLocalDate(selected.createdAt,data.location.timezone)],
            ].map(([label,value])=><div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
          </dl>}
        </MerchantSheet>
      </>}
    </div>;
  }

  function renderSetup(): ReactNode {
    const setup = data.setup;
    if (!setup) return <EmptyState title={t("尚未建立開店流程")} body={t("請聯絡平台管理員確認商家核准與試用方案狀態。")}/>;
    const steps = [
      {key:"brand",label:"品牌資料",group:"business",href:`/merchant/settings?${scope}`},
      {key:"location",label:"分店資料",group:"business",href:`/merchant/locations?${scope}`},
      {key:"service",label:"服務項目",group:"business",href:`/merchant/services?${scope}`},
      {key:"staff",label:"服務人員與技能",group:"business",href:`/merchant/staff?${scope}`},
      {key:"resource",label:"空間與設備",group:"business",href:`/merchant/resources?${scope}`},
      {key:"businessHours",label:"營業時間",group:"booking"},
      {key:"policies",label:"預約、取消與訂金規則",group:"booking"},
      {key:"notifications",label:"通知通道",group:"booking"},
      {key:"testBooking",label:"測試預約",group:"launch"},
    ] as const;
    const baseSetupComplete = steps.filter(step=>step.key!=="testBooking").every(step=>setup.steps[step.key]);
    const panelTitle = setupPanel === "businessHours" ? "設定營業時間" : setupPanel === "policies" ? "設定預約政策" : setupPanel === "notifications" ? "確認通知通道" : setupPanel === "goLive" ? "準備正式上線" : "執行測試預約";
    const done = setupPanel === "goLive" ? Boolean(setup.goLiveAt) : Boolean(steps.find(step=>step.key===setupPanel && setup.steps[step.key]));
    const openPanel = (key:string) => {setSetupPanel(key);setError(null);setFeedback(null);};
    const canSave = setupPanel === "businessHours" || setupPanel === "policies" ? can("location.manage") : setupPanel === "notifications" ? can("organization.manage") : setupPanel === "testBooking" ? can("booking.create") && baseSetupComplete : true;
    return <div className="merchant-business">
      <section className="merchant-setup-progress" aria-label={t("完成進度")}>
        <div><span>{t("完成進度")}</span><strong>{setup.completedSteps} / {setup.totalSteps}</strong><span className="merchant-state-badge">{t(setup.goLiveAt ? "已上線" : "尚未上線")}</span></div>
        <progress max={setup.totalSteps} value={setup.completedSteps} aria-label={t("完成進度")}/>
      </section>
      <div className="merchant-section-tabs merchant-setup-tabs" aria-label={t("開店階段")}>
        {([["business","商家資料"],["booking","預約設定"],["launch","開放預約"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={setupGroup===key} onClick={()=>setSetupGroup(key)}>{t(label)}<small>{steps.filter(step=>step.group===key && setup.steps[step.key]).length}/{steps.filter(step=>step.group===key).length}</small></button>)}
      </div>
      <div className="merchant-directory">
        {steps.filter(step=>step.group===setupGroup).map(step=>{
          const content=<><span className={`merchant-step-state ${setup.steps[step.key] ? "is-complete" : ""}`}>{setup.steps[step.key] ? <Check aria-hidden="true" size={18}/> : <span aria-hidden="true">{steps.indexOf(step)+1}</span>}</span><span><strong>{t(step.label)}</strong><small>{t(setup.steps[step.key] ? "已完成" : "待完成")}</small></span><ChevronRight aria-hidden="true" size={20}/></>;
          return "href" in step ? <Link key={step.key} href={step.href} className="merchant-row">{content}</Link> : <button key={step.key} type="button" className="merchant-row" onClick={()=>openPanel(step.key)}>{content}</button>;
        })}
      </div>
      {setupGroup==="launch" && (setup.goLiveAt
        ? <Link className="merchant-business-action" href={publicBookingPath} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" size={18}/>{t("開啟公開預約")}</Link>
        : <button className="merchant-business-action" type="button" disabled={isSubmitting || !baseSetupComplete || !setup.steps.testBooking} onClick={()=>openPanel("goLive")}><Rocket aria-hidden="true" size={18}/>{t("正式上線")}</button>)}
      <MerchantSheet open={setupPanel!==null} onClose={()=>setSetupPanel(null)} title={t(panelTitle)} busy={isSubmitting} error={error} feedback={feedback}
        footer={!done && <button type={setupPanel==="businessHours" || setupPanel==="policies" ? "submit" : "button"} form="merchant-setup-form" className="merchant-business-action"
          disabled={isSubmitting || !canSave || (setupPanel==="businessHours" && !setupHoursDraft.days.length)}
          onClick={()=>{if(setupPanel==="notifications") void runSetupAction({action:"NOTIFICATIONS",channels:["LINE","EMAIL"]}); else if(setupPanel==="testBooking") void runSetupAction({action:"CREATE_TEST_BOOKING"}); else if(setupPanel==="goLive") void runSetupAction({action:"GO_LIVE"});}}>
          {setupPanel==="testBooking" ? <TestTube2 aria-hidden="true" size={18}/> : setupPanel==="goLive" ? <Rocket aria-hidden="true" size={18}/> : <Save aria-hidden="true" size={18}/>}
          {t(isSubmitting ? "處理中..." : setupPanel==="testBooking" ? "建立並完成測試預約" : setupPanel==="goLive" ? "確認開放預約" : "儲存")}
        </button>}>
        {done ? <div className="space-y-4"><p className="flex items-center gap-2 text-teal"><Check aria-hidden="true" size={20}/>{t("已完成")}</p>
          {setupPanel==="businessHours" && <Link className="merchant-business-action" href={`/merchant/calendar?${scope}`}>{t("預約行事曆")}<ChevronRight aria-hidden="true" size={18}/></Link>}
          {(setupPanel==="policies" || setupPanel==="notifications") && <Link className="merchant-business-action" href={`/merchant/settings?${scope}`}>{t("查看設定")}<ChevronRight aria-hidden="true" size={18}/></Link>}
        </div> : <>
          {setupPanel==="businessHours" && <form id="merchant-setup-form" className="merchant-sheet-form" onSubmit={event=>{event.preventDefault();void runSetupAction({action:"BUSINESS_HOURS",...setupHoursDraft});}}>
            <fieldset disabled={isSubmitting}><legend>{t("營業日")}</legend><div className="merchant-weekdays">
              {["週日","週一","週二","週三","週四","週五","週六"].map((label,day)=><label key={day}><input type="checkbox" name="days" value={day} checked={setupHoursDraft.days.includes(day)} onChange={event=>setSetupHoursDraft(current=>({...current,days:event.target.checked ? [...current.days,day].sort() : current.days.filter(value=>value!==day)}))}/><span>{t(label)}</span></label>)}
            </div></fieldset>
            <div className="grid grid-cols-2 gap-3">
              {([["opensAt","開始"],["closesAt","結束"]] as const).map(([name,label])=><label key={name} className="min-w-0"><span>{t(label)}</span><input className="merchant-business-input" name={name} required type="time" disabled={isSubmitting} value={setupHoursDraft[name]} onChange={event=>setSetupHoursDraft(current=>({...current,[name]:event.target.value}))}/></label>)}
            </div>
          </form>}
          {setupPanel==="policies" && <>
            <div className="merchant-section-tabs">
              {([["booking","預約規則"],["deposit","訂金設定"]] as const).map(([key,label])=><button key={key} type="button" aria-pressed={setupPolicyTab===key} onClick={()=>setSetupPolicyTab(key)}>{t(label)}</button>)}
            </div>
            <form id="merchant-setup-form" className="merchant-sheet-form" onInvalidCapture={event=>{
              const target=event.target;
              if(target instanceof HTMLInputElement){const tab=target.closest<HTMLElement>("[data-policy-tab]");if(tab){setSetupPolicyTab(tab.dataset.policyTab!);requestAnimationFrame(()=>target.focus());}}
            }} onSubmit={event=>{event.preventDefault();void runSetupAction({
              action:"POLICIES",slotIntervalMinutes:setupPolicyDraft.slotIntervalMinutes,
              minimumLeadMinutes:Number(setupPolicyDraft.minimumLeadMinutes),maximumAdvanceDays:Number(setupPolicyDraft.maximumAdvanceDays),
              holdMinutes:Number(setupPolicyDraft.holdMinutes),cancellationCutoffHours:Number(setupPolicyDraft.cancellationCutoffHours),
              depositMode:setupPolicyDraft.depositMode,depositAmountMinor:Math.round(Number(setupPolicyDraft.depositAmount)*100),depositPercentage:Number(setupPolicyDraft.depositPercentage),
            });}}>
              <div hidden={setupPolicyTab!=="booking"} data-policy-tab="booking" className="merchant-sheet-form">
                <label>{t("時段間隔")}<select className="merchant-business-input" name="slotIntervalMinutes" disabled={isSubmitting} value={setupPolicyDraft.slotIntervalMinutes} onChange={event=>setSetupPolicyDraft(current=>({...current,slotIntervalMinutes:event.target.value}))}>{[15,30,60].map(value=><option key={value} value={value}>{value} {t("分鐘")}</option>)}</select></label>
                {([["minimumLeadMinutes","最少提前分鐘",0,43200],["maximumAdvanceDays","最遠可約天數",1,365],["holdMinutes","保留分鐘",5,60],["cancellationCutoffHours","免費取消小時",0,720]] as const).map(([name,label,min,max])=><label key={name}>{t(label)}<input className="merchant-business-input" name={name} type="number" inputMode="numeric" min={min} max={max} required disabled={isSubmitting} value={setupPolicyDraft[name]} onChange={event=>setSetupPolicyDraft(current=>({...current,[name]:event.target.value}))}/></label>)}
              </div>
              <div hidden={setupPolicyTab!=="deposit"} data-policy-tab="deposit" className="merchant-sheet-form">
                <label>{t("訂金方式")}<select className="merchant-business-input" name="depositMode" disabled={isSubmitting} value={setupPolicyDraft.depositMode} onChange={event=>setSetupPolicyDraft(current=>({...current,depositMode:event.target.value}))}>{([["NONE","不收訂金"],["FIXED","固定金額"],["PERCENTAGE","比例"]] as const).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
                {setupPolicyDraft.depositMode==="FIXED" && <label>{t("固定訂金（元）")}<input className="merchant-business-input" name="depositAmount" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required disabled={isSubmitting} value={setupPolicyDraft.depositAmount} onChange={event=>setSetupPolicyDraft(current=>({...current,depositAmount:event.target.value}))}/></label>}
                {setupPolicyDraft.depositMode==="PERCENTAGE" && <label>{t("訂金比例（%）")}<input className="merchant-business-input" name="depositPercentage" type="number" inputMode="numeric" min="1" max="100" required disabled={isSubmitting} value={setupPolicyDraft.depositPercentage} onChange={event=>setSetupPolicyDraft(current=>({...current,depositPercentage:event.target.value}))}/></label>}
              </div>
            </form>
          </>}
          {setupPanel==="notifications" && <p className="text-sm leading-6 text-slate-600">{t("LINE 與 Email 先建立為停用狀態，之後加入正式憑證才會發送。")}</p>}
          {setupPanel==="testBooking" && <div className="space-y-3 text-sm leading-6 text-slate-600"><p>{t("系統會使用第一個可用服務、服務人員與時段完成一筆測試預約，不列入正式用量。")}</p>{!baseSetupComplete && <p role="status">{t("請先完成前八項開店設定。")}</p>}</div>}
          {setupPanel==="goLive" && <p className="text-sm leading-6 text-slate-600">{t("上線後會公開商家頁並開放此分店接受顧客預約。")}</p>}
        </>}
      </MerchantSheet>
    </div>;
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
      <div className="space-y-4 merchant-settings">
        <div className="merchant-directory">
          {([
            {key:"brand",title:"品牌與公司資料",detail:data.organization.name,Icon:Store},
            {key:"booking",title:"預約規則與訂金",detail:t(data.location.onlineBookingEnabled ? "線上預約已開啟" : "線上預約已關閉"),Icon:BadgeDollarSign},
            {key:"notifications",title:"通知健康狀態",detail:`${data.notificationHealth.failed + data.notificationHealth.deadLetter} ${t("待處理")}`,Icon:Bell},
          ] as const).map(item=><button className="merchant-row" key={item.key} type="button" aria-label={t(item.title)} onClick={()=>{setSettingsPanel(item.key);setError(null);setFeedback(null);}}>
            <item.Icon aria-hidden="true" className="h-6 w-6 text-teal"/><span className="min-w-0"><strong className="block">{t(item.title)}</strong><span className="merchant-row-meta">{item.detail}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5"/>
          </button>)}
        </div>
        <MerchantSheet open={settingsPanel === "brand"} onClose={()=>setSettingsPanel(null)} title={t("品牌與公司資料")} busy={isSubmitting} error={error} feedback={feedback}
          footer={brandTab === "profile" && can("organization.manage") && <button type="submit" form="merchant-brand-form" className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting}>{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
        <div className="merchant-section-tabs" aria-label={t("品牌與公司資料")}>
          <button type="button" aria-pressed={brandTab === "profile"} onClick={()=>setBrandTab("profile")}>{t("基本資料")}</button>
          <button type="button" aria-pressed={brandTab === "media"} onClick={()=>setBrandTab("media")}>{t("品牌圖片")}</button>
        </div>
        <section>
          <div hidden={brandTab !== "media"}>
          <MerchantImage src={data.organization.coverImageUrl} alt={`${data.organization.name} ${t("品牌封面")}`} label={t("更新品牌封面")} busy={isSubmitting}
            onFile={can("organization.manage") ? file=>void uploadMedia("ORGANIZATION_COVER",data.organization.id,file) : undefined}/>
          </div>
          <div className="py-4">
            <div hidden={brandTab !== "media"}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <MerchantImage src={data.organization.logoUrl} alt={`${data.organization.name} Logo`} label={t("更新 Logo")} busy={isSubmitting} square
                  onFile={can("organization.manage") ? file=>void uploadMedia("ORGANIZATION_LOGO",data.organization.id,file) : undefined}/>
                <div>
                  <h2 className="font-semibold text-ink"> {t("品牌與公司資料")} </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.organization.entityType === "COMPANY"
                      ? t("企業戶")
                      : t("個體戶")}
                    · {data.locations.length} {t("間分店")} </p>
                </div>
              </div>
            </div>
            </div>
            {can("organization.manage") ? (
              <form
                id="merchant-brand-form" hidden={brandTab !== "profile"} className="merchant-sheet-form"
                onSubmit={(event) => void saveOrganizationProfile(event)}
              >
                <Field
                  value={brandDraft.name} onChange={name=>setBrandDraft(current=>({...current,name}))} disabled={isSubmitting}
                  label={t("品牌名稱")}
                  name="name"
                  required
                />
                <Field
                  value={brandDraft.businessName} onChange={businessName=>setBrandDraft(current=>({...current,businessName}))} disabled={isSubmitting}
                  label={t("公司／商業登記名稱")}
                  name="businessName"
                  required
                />
                <label>
                  <span className="text-sm font-medium text-slate-700"> {t("帳戶類型")} </span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    value={brandDraft.entityType} onChange={event=>setBrandDraft(current=>({...current,entityType:event.target.value}))} disabled={isSubmitting} aria-label={t("帳戶類型")}
                    name="entityType"
                  >
                    <option value="SOLE_PROPRIETOR"> {t("個體戶")} </option>
                    <option value="COMPANY"> {t("企業戶")} </option>
                  </select>
                </label>
                <Field
                  value={brandDraft.phone} onChange={phone=>setBrandDraft(current=>({...current,phone}))} disabled={isSubmitting} type="tel"
                  label={t("公司電話")}
                  name="phone"
                  required
                />
                <Field
                  value={brandDraft.email} onChange={email=>setBrandDraft(current=>({...current,email}))} disabled={isSubmitting}
                  label={t("公司 Email")}
                  name="email"
                  required
                  type="email"
                  wide
                />
                <label className="sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700"> {t("品牌介紹")} </span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-md border border-slate-300 p-3"
                    value={brandDraft.brandDescription} onChange={event=>setBrandDraft(current=>({...current,brandDescription:event.target.value}))} disabled={isSubmitting} aria-label={t("品牌介紹")}
                    maxLength={1000}
                    name="brandDescription"
                  />
                </label>
              </form>
            ) : <p className="break-words text-sm text-slate-600">{data.organization.name} · {data.organization.businessName}</p>}
          </div>
        </section>
        </MerchantSheet>
        <MerchantSheet open={settingsPanel === "booking"} onClose={()=>setSettingsPanel(null)} title={t("預約規則與訂金")} busy={isSubmitting} error={error} feedback={feedback}
          footer={can("location.manage") && <button type="submit" form="merchant-booking-settings" className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting}>{t(isSubmitting ? "儲存中..." : "儲存")}</button>}>
        <section>
          <div className="merchant-section-tabs" aria-label={t("預約規則與訂金")}>
            <button type="button" aria-pressed={bookingTab === "booking"} onClick={()=>setBookingTab("booking")}>{t("預約規則")}</button>
            <button type="button" aria-pressed={bookingTab === "deposit"} onClick={()=>setBookingTab("deposit")}>{t("訂金")}</button>
          </div>
          <form
            id="merchant-booking-settings" className="mt-4"
            onInvalidCapture={event=>{
              const field = event.target as HTMLInputElement;
              const section = field.closest("fieldset");
              if (section?.hidden) {
                event.preventDefault();
                setBookingTab(section.dataset.section ?? "booking");
                requestAnimationFrame(()=>{field.focus();field.reportValidity();});
              }
            }}
            onSubmit={(event) => void saveBookingSettings(event)}
          >
            <fieldset data-section="booking" hidden={bookingTab !== "booking"} disabled={!can("location.manage") || isSubmitting} className="merchant-sheet-form">
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink"> {t("開放線上預約")} </span>
                <span className="mt-1 block text-xs text-slate-500"> {t("關閉後顧客無法從公開頁建立新預約")} </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                checked={bookingDraft.onlineBookingEnabled} onChange={event=>setBookingDraft(current=>({...current,onlineBookingEnabled:event.target.checked}))}
                disabled={!can("location.manage") || isSubmitting}
                name="onlineBookingEnabled"
                type="checkbox"
              />
            </label>
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink"> {t("允許顧客自行取消")} </span>
                <span className="mt-1 block text-xs text-slate-500"> {t("顧客可從安全預約連結送出取消")} </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                checked={bookingDraft.customerCancellationEnabled} onChange={event=>setBookingDraft(current=>({...current,customerCancellationEnabled:event.target.checked}))}
                disabled={!can("location.manage") || isSubmitting}
                name="customerCancellationEnabled"
                type="checkbox"
              />
            </label>
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink"> {t("允許顧客自行改期")} </span>
                <span className="mt-1 block text-xs text-slate-500"> {t("已收款預約仍須由店家協助處理")} </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                checked={bookingDraft.customerRescheduleEnabled} onChange={event=>setBookingDraft(current=>({...current,customerRescheduleEnabled:event.target.checked}))}
                disabled={!can("location.manage") || isSubmitting}
                name="customerRescheduleEnabled"
                type="checkbox"
              />
            </label>
            <Field
              value={bookingDraft.cancellationCutoffHours} onChange={cancellationCutoffHours=>setBookingDraft(current=>({...current,cancellationCutoffHours}))}
              label={t("免費取消期限（預約前小時）")}
              max="720"
              min="0"
              name="cancellationCutoffHours"
              type="number"
            />
            </fieldset>
            <fieldset data-section="deposit" hidden={bookingTab !== "deposit"} disabled={!can("location.manage") || isSubmitting} className="merchant-sheet-form">
            <label className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-100 pb-4 sm:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-ink"> {t("收取訂金")} </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {data.features.deposits
                    ? t("套用分店預設規則，仍可在顧客頁個別指定")
                    : t("目前方案尚未啟用訂金功能")}
                </span>
              </span>
              <input
                className="h-5 w-5 accent-teal"
                checked={bookingDraft.depositsEnabled} onChange={event=>setBookingDraft(current=>({...current,depositsEnabled:event.target.checked}))}
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
              <span className="text-sm font-medium text-slate-700"> {t("訂金方式")} </span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                value={bookingDraft.depositMode} onChange={event=>setBookingDraft(current=>({...current,depositMode:event.target.value === "PERCENTAGE" ? "PERCENTAGE" : "FIXED"}))} aria-label={t("訂金方式")}
                disabled={!data.features.deposits}
                name="depositMode"
              >
                <option value="FIXED"> {t("固定金額")} </option>
                <option value="PERCENTAGE"> {t("服務金額比例")} </option>
              </select>
            </label>
            <Field
              value={bookingDraft.depositAmount} onChange={depositAmount=>setBookingDraft(current=>({...current,depositAmount}))}
              disabled={!data.features.deposits}
              label={t("固定訂金（TWD）")}
              min="0"
              name="depositAmount"
              type="number"
            />
            <Field
              value={bookingDraft.depositPercentage} onChange={depositPercentage=>setBookingDraft(current=>({...current,depositPercentage}))}
              disabled={!data.features.deposits}
              label={t("訂金比例（%）")}
              min="0"
              name="depositPercentage"
              type="number"
            />
            </fieldset>
          </form>
        </section>
        </MerchantSheet>

        <div className="merchant-directory">
          <Link className="merchant-row" href={publicBookingPath} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" className="h-6 w-6 text-teal"/><span className="min-w-0"><strong className="block">{t("公開預約連結")}</strong><span className="merchant-row-meta break-all">{publicBookingPath}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5"/>
          </Link>
          <Link className="merchant-row" href={`/merchant/locations?${scope}`}>
            <Building2 aria-hidden="true" className="h-6 w-6 text-teal"/><span className="min-w-0"><strong className="block">{t("管理分店")}</strong><span className="merchant-row-meta">{data.location.name} · {t(data.location.bookingState === "OPEN" ? "開放預約" : data.location.bookingState === "PAUSED" ? "暫停預約" : "關閉")}</span></span><ChevronRight aria-hidden="true" className="h-5 w-5"/>
          </Link>
        </div>

        <MerchantSheet open={settingsPanel === "notifications"} onClose={()=>setSettingsPanel(null)} title={t("通知健康狀態")} busy={isSubmitting} error={error} feedback={feedback}>
        <NotificationHealthPanel
          deliveries={data.notificationDeliveries}
          health={data.notificationHealth}
          integrations={data.notificationIntegrations}
          isSubmitting={isSubmitting}
          timezone={data.location.timezone}
          onRetry={retryNotification}
        />
        </MerchantSheet>
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
        return renderStaff();
      case "team":
        return <MerchantTeam members={teamData} locationName={data.location.name}/>;
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
    <MerchantShell organization={data.organization.slug} organizationName={data.organization.name}
      location={data.location.slug} locationName={data.location.name} identity={data.session.displayName}
      activeView={activeView} crmVisible={crmVisible} operationsVisible={can("staff.manage") || can("billing.read")}
      teamVisible={can("team.read")}
      disabled={isSubmitting}>
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
                {t(viewTitles[activeView])}
              </h1>
            </div>
            {data.location.bookingState !== "OPEN" ? (
              <span className="flex items-center gap-2 rounded bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                <PauseCircle
                  aria-hidden="true"
                  className="h-4 w-4"
                /> {t("目前暫停公開預約")} </span>
            ) : null}
          </div>

          {feedback && !(activeView === "setup" && setupPanel) ? (
            <p
              role="status"
              className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              {t(feedback)}
            </p>
          ) : null}
          {error && !(activeView === "setup" && setupPanel) ? (
            <p
              role="alert"
              className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorText(error)}
            </p>
          ) : null}

          {renderContent()}
        </main>
      <MerchantSheet open={selectedBookingId !== null} onClose={()=>setSelectedBookingId(null)} title={t("預約詳細資料")} busy={isSubmitting} error={error} feedback={feedback}>
        {renderBookingRows({bookings:visibleBookings.filter(booking=>booking.id === selectedBookingId)})}
      </MerchantSheet>
      <MerchantSheet open={statusChange !== null} onClose={()=>setStatusChange(null)} title={t("變更預約狀態")} description={statusChange ? t(statusLabels[statusChange.nextStatus]) : undefined} busy={isSubmitting} error={error}
        footer={<button type="submit" form="merchant-status-change" className="rounded-md bg-ink px-5 text-white" disabled={isSubmitting || !statusReason.trim()}>{t(isSubmitting ? "處理中..." : "確認變更")}</button>}>
        <form id="merchant-status-change" onSubmit={event=>{event.preventDefault(); if (statusChange) void updateBookingStatus(statusChange.bookingId,statusChange.nextStatus,statusReason);}}>
          <label className="block" htmlFor="merchant-status-reason">{t("變更原因")}</label>
          <textarea id="merchant-status-reason" className="mt-2 min-h-24 w-full rounded-md border border-slate-300 p-3" name="statusReason" required maxLength={500} disabled={isSubmitting} value={statusReason} onChange={event=>setStatusReason(event.target.value)}/>
        </form>
      </MerchantSheet>
      {paymentConfirmationId && paymentConfirmationBooking ? (
        <MerchantSheet open onClose={()=>setPaymentConfirmationId(null)} title={t("確認已收到訂金")} busy={isSubmitting} error={error}
          footer={<button className="rounded-md bg-teal px-4 font-semibold text-white" disabled={isSubmitting} type="button" onClick={()=>void confirmPayment(paymentConfirmationId)}>{t(isSubmitting ? "處理中..." : "確認已收款")}</button>}>
            <p className="mt-3 text-sm leading-6 text-slate-600"> {t("將記錄已收到")} {" "}
              {formatMoney(
                Math.max(
                  1,
                  paymentConfirmationBooking.depositRequiredMinor -
                    paymentConfirmationBooking.paidMinor,
                ),
                paymentConfirmationBooking.currency,
              )} {t("，完成後預約狀態會同步更新。")} </p>
        </MerchantSheet>
      ) : null}
    </MerchantShell>
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
  const {t} = useLanguage();
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-sm font-medium text-slate-700">{t(label)}</span>
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

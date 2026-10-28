"use client";

import {useLanguage} from "@/components/language-provider";
import {MerchantShell} from "@/components/merchant-shell";
import {useMerchantPagination} from "@/components/merchant-sheet";

import { useEffect, useState } from "react";
import { requestId } from "@/lib/line-booking/request-id";
import { Clock, CalendarClock, Wallet, Gift, Shuffle, UsersRound, MoreHorizontal, Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import styles from "./review.module.css";
import { QualificationReview } from "./qualification-review";
import { BenefitResult } from "@/components/member-benefits";

type Attendance = { id: string; profileId: string; kind: string;
  occurredAt: string; correctedAt: string | null };
type Period = { id: string; profileId: string; from: string; until: string;
  totalMinor: number; status: string; revision: number };
type ReviewData = { attendance: Attendance[]; periods: Period[];
  employees: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  rules: Array<{ id: string; version: number; profileId: string | null }> };
type Envelope<T> = { data?: T; error?: { message?: string } };
type Policies = { promotions: Array<{ id: string; policyKey: string; version: number;
  kind: string; publishedAt: string | null }>;
  commissions: Array<{ id: string; version: number; basis: string;
    publishedAt: string | null }> };
type Payslip = { status: string; totalMinor: number; from: string; until: string;
  lines: Array<{ kind: string; amountMinor: number; minutes: number | null }> };
const labels: Record<string, string> = {
  CLOCK_IN: "上班", CLOCK_OUT: "下班", BREAK_START: "休息開始", BREAK_END: "休息結束",
  DRAFT: "草稿", APPROVED: "已核准", SUPERSEDED: "已取代", GRANTED: "已同意", REVOKED: "已撤回",
  SEASONAL: "季節優惠", MOTHERS_DAY: "母親節優惠", BIRTHDAY: "生日優惠", VIP: "貴賓優惠",
  ORIGINAL: "原價", DISCOUNTED: "折扣後金額", PAID_COMPONENT: "實付金額", FIXED: "固定金額",
  RESERVE: "保留權益", REDEEM: "核銷權益", RELEASE: "釋放權益", CANCEL: "取消權益",
  BASE: "基本薪資", BASE_PAY: "基本薪資", HOURLY: "時薪", OVERTIME: "加班費",
  COMMISSION: "服務抽成", REFUND_ADJUSTMENT: "退款調整", REVIEW: "待審核", LEAVE: "請假",
};
const label = (value: string) => labels[value] ?? "待確認";
const workspaceViews = [
  {id:"timing",label:"現場排程",shortLabel:"排程",icon:CalendarClock,secondary:false},
  {id:"benefits",label:"會員結帳",shortLabel:"結帳",icon:Gift,secondary:false},
  {id:"attendance",label:"出勤紀錄",shortLabel:"工時",icon:Clock,secondary:false},
  {id:"reassignment",label:"預約改派",shortLabel:"改派",icon:Shuffle,secondary:false},
  {id:"payroll",label:"薪資試算",shortLabel:"薪資試算",icon:Wallet,secondary:true},
  {id:"allocation",label:"多人抽成",shortLabel:"多人抽成",icon:UsersRound,secondary:true},
];
const money = (minor: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "TWD", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(minor / 100);

function csrfToken() {
  const cookie = document.cookie.split("; ").find(item => item.startsWith("beauty_csrf="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

export function OperationsReview({ organization, organizationName, location, locationName, identity, crmVisible, teamVisible, timezone }: {
  organization: string; organizationName: string; location: string; locationName: string;
  identity: string; crmVisible: boolean; teamVisible: boolean; timezone: string }) {
  const {t, errorText} = useLanguage();
  const query = new URLSearchParams({ organization, location }).toString();
  const [data, setData] = useState<ReviewData | null>(null);
  const [workspaceView, setWorkspaceView] = useState("timing");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [employee, setEmployee] = useState("");
  const [rule, setRule] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [refundId, setRefundId] = useState("");
  const [adjustDate, setAdjustDate] = useState("");
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [marketingConsent, setMarketingConsent] = useState<{
    currentlyGranted:boolean;history:Array<{ status:string;capturedAt:string;
      source:string;policyVersion:string }> } | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [issueId, setIssueId] = useState("");
  const [benefitKind, setBenefitKind] = useState<"COUPON" | "SERVICE_PACKAGE">("COUPON");
  const [quantity, setQuantity] = useState(1);
  const [discountMinor, setDiscountMinor] = useState(100);
  const [serviceVariantId, setServiceVariantId] = useState("");
  const [benefitResult, setBenefitResult] = useState<unknown>(null);
  const [bookingVersion, setBookingVersion] = useState(1);
  const [relationshipAttested, setRelationshipAttested] = useState(false);
  const [policies, setPolicies] = useState<Policies | null>(null);
  const [sourceStaffId, setSourceStaffId] = useState("");
  const [targetStaffId, setTargetStaffId] = useState("");
  const [futureBookings, setFutureBookings] = useState<Array<{
    id: string; startsAt: string; serviceName: string; staffName: string }>>([]);
  const [statusKind, setStatusKind] = useState<"VIP" | "BLACKLIST">("VIP");
  const [statusScope, setStatusScope] = useState<"LOCATION" | "ORGANIZATION">("LOCATION");
  const [statusReason, setStatusReason] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [ruleVersion, setRuleVersion] = useState(1);
  const [rulePriority, setRulePriority] = useState(1);
  const [ruleFrom, setRuleFrom] = useState("");
  const [ruleUntil, setRuleUntil] = useState("");
  const [ruleVariant, setRuleVariant] = useState("");
  const [promotionKind, setPromotionKind] = useState<"SEASONAL" | "MOTHERS_DAY" |
    "BIRTHDAY" | "VIP">("SEASONAL");
  const [discountPercent, setDiscountPercent] = useState(10);
  const [commissionBasis, setCommissionBasis] = useState<"ORIGINAL" | "DISCOUNTED" |
    "PAID_COMPONENT" | "FIXED">("DISCOUNTED");
  const [commissionAmount, setCommissionAmount] = useState(1000);
  const [walkin, setWalkin] = useState<{ earliestStartMinutes: number;
    setupBufferMinutes: number; onlineMinimumAdvanceApplies: boolean;
    version: number } | null>(null);
  const [walkinEarliest, setWalkinEarliest] = useState(15);
  const [walkinBuffer, setWalkinBuffer] = useState(10);
  const [walkinOnlineLead, setWalkinOnlineLead] = useState(true);
  const [allocationSegment, setAllocationSegment] = useState("");
  const [allocationMethod, setAllocationMethod] = useState<"PERCENT"|"FIXED">("PERCENT");
  const [allocationLines, setAllocationLines] = useState<Array<{ staffProfileId: string;
    amount: number }>>([{ staffProfileId: "", amount: 6000 },
    { staffProfileId: "", amount: 4000 }]);
  const [allocationPreview, setAllocationPreview] = useState<{ bookingVersion: number;
    version: number; commissionPoolMinor: number; lines: Array<{
      staffProfileId: string; quotedMinor: number }> } | null>(null);
  const attendancePage = useMerchantPagination(data?.attendance ?? []);
  const periodPage = useMerchantPagination(data?.periods ?? []);
  const approvedPage = useMerchantPagination(data?.periods.filter(period => period.status === "APPROVED") ?? []);
  const futurePage = useMerchantPagination(futureBookings);
  const payslipPage = useMerchantPagination(payslip?.lines ?? []);
  const consentPage = useMerchantPagination(marketingConsent?.history ?? []);
  const promotionPage = useMerchantPagination(policies?.promotions ?? []);
  const commissionPage = useMerchantPagination(policies?.commissions ?? []);
  useEffect(() => {
    let active = true;
    fetch(`/api/merchant/operations?${query}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Envelope<ReviewData>;
        if (active) setData(result.data ?? null);
      }).catch(() => { if (active) setMessage("無法載入營運資料，請重新整理後再試"); });
    return () => { active = false; };
  }, [query]);
  async function refresh() {
    const response = await fetch(`/api/merchant/operations?${query}`, { cache: "no-store" });
    const result = await response.json() as Envelope<ReviewData>;
    setData(result.data ?? null);
  }
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/operations?${query}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() }, body: JSON.stringify(body),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "操作失敗，請稍後再試");
      setMessage("已儲存"); await refresh();
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "操作失敗，請稍後再試"); }
    finally { setBusy(false); }
  }
  async function showPayslip(periodId: string) {
    const response = await fetch(`/api/merchant/operations?${query}&periodId=${periodId}`);
    const result = await response.json() as Envelope<{ payslip: Payslip }>;
    setPayslip(result.data?.payslip ?? null);
  }
  async function benefitRequest(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage(""); setBenefitResult(null);
    try {
      const response = await fetch(`/api/merchant/benefits?${query}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() }, body: JSON.stringify(body),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "會員權益操作失敗");
      setBenefitResult(result.data); setMessage("已儲存");
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "會員權益操作失敗"); }
    finally { setBusy(false); }
  }
  async function previewBenefit(key: "customerId" | "bookingId", value: string) {
    if (busy) return;
    setBusy(true); setMessage(""); setBenefitResult(null);
    try {
      const response = await fetch(`/api/merchant/benefits?${query}&${key}=${encodeURIComponent(value)}`, { cache: "no-store" });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "無法載入權益資料，請重試。");
      setBenefitResult(result.data);
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "無法載入權益資料，請重試。"); }
    finally { setBusy(false); }
  }
  async function promotion(mode: "PREVIEW" | "APPLY") {
    if (busy || !bookingId) return;
    setBusy(true); setMessage(""); setBenefitResult(null);
    try {
      const response = await fetch(`/api/merchant/bookings/promotion?${query}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        body: JSON.stringify({ mode, bookingId, relationshipAttested,
          ...(mode === "APPLY" ? { expectedVersion: bookingVersion } : {}) }),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "優惠試算失敗");
      setBenefitResult(result.data); setMessage(mode === "APPLY" ? "已儲存結帳金額" : "已完成試算");
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "優惠試算失敗"); }
    finally { setBusy(false); }
  }
  async function loadPolicies() {
    const response = await fetch(`/api/merchant/benefits?${query}&policies=true`);
    const result = await response.json() as Envelope<Policies>;
    setPolicies(result.data ?? null);
  }
  async function loadFutureBookings() {
    const response = await fetch(`/api/merchant/bookings/reassign?${query}&staffId=${sourceStaffId}`);
    const result = await response.json() as Envelope<{ bookings: typeof futureBookings }>;
    setFutureBookings(result.data?.bookings ?? []);
    if (!response.ok) setMessage(result.error?.message || "無法載入未來預約");
  }
  async function reassign(bookingId: string) {
    const reason = prompt(t("請填寫改派原因"));
    if (!reason || !targetStaffId || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/bookings/reassign?${query}`, {
        method: "PATCH", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        body: JSON.stringify({ bookingId, targetStaffId, reason }),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "改派失敗，請稍後再試");
      setMessage("已確認改派"); await loadFutureBookings();
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "改派失敗，請稍後再試"); }
    finally { setBusy(false); }
  }
  async function changeCustomerStatus(enabled: boolean) {
    if (!customerId || !statusReason.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/customers/status?${query}`, {
        method: "PATCH", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        body: JSON.stringify({ customerId, scope: statusScope,
          statusKind, enabled, reason: statusReason }),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "顧客狀態更新失敗");
      setMessage("已更新顧客狀態");
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "顧客狀態更新失敗"); }
    finally { setBusy(false); }
  }
  async function reviewMarketingConsent() {
    if (!customerId) return;
    const response = await fetch(`/api/merchant/customers/marketing-consent?${query}`+
      `&customerId=${encodeURIComponent(customerId)}`,{ cache:"no-store" });
    const result = await response.json() as Envelope<{ consent:typeof marketingConsent }>;
    if (!response.ok) { setMessage(result.error?.message ?? "無法載入行銷同意紀錄"); return; }
    setMarketingConsent(result.data?.consent ?? null); setMessage("");
  }
  async function walkinRequest(method: "GET"|"PATCH") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/operations/walkin?${query}`, {
        method, headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        ...(method === "PATCH" ? { body: JSON.stringify({
          earliestStartMinutes: walkinEarliest, setupBufferMinutes: walkinBuffer,
          onlineMinimumAdvanceApplies: walkinOnlineLead,
          ...(walkin ? { expectedVersion: walkin.version } : {}),
        }) } : {}),
      });
      const result = await response.json() as Envelope<{ policy: typeof walkin }>;
      if (!response.ok) throw Error(result.error?.message || "現場排程設定失敗");
      setWalkin(result.data?.policy ?? null);
      if (result.data?.policy) {
        setWalkinEarliest(result.data.policy.earliestStartMinutes);
        setWalkinBuffer(result.data.policy.setupBufferMinutes);
        setWalkinOnlineLead(result.data.policy.onlineMinimumAdvanceApplies);
      }
      setMessage(method === "PATCH" ? "已儲存現場排程" : "已載入排程設定");
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "無法載入排程設定"); }
    finally { setBusy(false); }
  }
  async function allocationRequest(publish: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/operations/commission-allocation?${query}`, {
        method: publish ? "PUT" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ bookingSegmentId: allocationSegment,
          method: allocationMethod, lines: allocationLines.map(line => ({
            staffProfileId: line.staffProfileId,
            ...(allocationMethod === "PERCENT" ? { shareBps: line.amount } :
              { fixedMinor: line.amount }),
          })),
          ...(allocationPreview ? { expectedVersion: allocationPreview.version-1 } : {}),
          ...(publish && allocationPreview ? {
            expectedBookingVersion: allocationPreview.bookingVersion } : {}),
        }),
      });
      const result = await response.json() as Envelope<{ preview?: typeof allocationPreview;
        allocation?: typeof allocationPreview }>;
      if (!response.ok) throw Error(result.error?.message || "抽成分配失敗");
      setAllocationPreview(result.data?.preview ?? result.data?.allocation ?? null);
      setMessage(publish ? "已發布抽成分配" : "已完成抽成試算");
    } catch (error) { setMessage(error instanceof Error && /\p{Script=Han}/u.test(error.message) ? error.message : "抽成分配失敗"); }
    finally { setBusy(false); }
  }
  const name = (profileId: string) => data?.employees.find(row => row.id === profileId)?.name ?? profileId;
  function selectWorkspace(view: string) {
    setWorkspaceView(view); setMessage(""); window.scrollTo({top:0});
  }
  return <MerchantShell organization={organization} organizationName={organizationName} location={location}
    locationName={locationName} identity={identity} activeView="operations" crmVisible={crmVisible} teamVisible={teamVisible} operationsVisible disabled={busy}>
    <main className={`${styles.workspace} ${styles.operationsShell}`} id="main-content">
    <h1>{t("營運管理")}</h1>
    {message && <p className={styles.feedback} role="status">{errorText(message)}</p>}
    <nav aria-label={t("營運工作區")} className={styles.appNavigation}>
      {workspaceViews.map(item =>
        <button key={item.id} type="button" aria-label={t(item.label)} title={t(item.label)}
          className={item.secondary ? styles.secondaryNavigation : undefined}
          aria-current={workspaceView===item.id ? "page" : undefined} onClick={()=>selectWorkspace(item.id)}>
          <item.icon size={20} aria-hidden="true"/>
          <span className={styles.desktopNavigationLabel}>{t(item.label)}</span>
          <span className={styles.mobileNavigationLabel}>{t(item.shortLabel)}</span></button>)}
      <div className={styles.mobileMore}>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={t("更多營運功能")} title={t("更多營運功能")}
              aria-current={workspaceViews.some(item=>item.secondary && item.id===workspaceView) ? "page" : undefined}>
              <MoreHorizontal size={20} aria-hidden="true"/><span>{t("更多")}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="top" align="end" sideOffset={12} collisionPadding={12}
            className="language-menu" aria-label={t("更多營運功能")}>
            {workspaceViews.filter(item=>item.secondary).map(item =>
              <DropdownMenu.Item key={item.id} role="menuitemradio" aria-checked={workspaceView===item.id}
                className="language-menu-item" onSelect={()=>selectWorkspace(item.id)}>
                <item.icon size={18} aria-hidden="true"/><span className="flex-1">{t(item.label)}</span>
                {workspaceView===item.id && <Check size={16} aria-hidden="true"/>}
              </DropdownMenu.Item>)}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </nav>
    <section hidden={workspaceView !== "attendance"} aria-label={t("出勤審核")}>
      <h2> {t("出勤紀錄")} </h2>
      <a href={`/api/merchant/operations?${query}&format=csv`}> {t("匯出出勤紀錄")} </a>
      <table><thead><tr><th> {t("員工")} </th><th> {t("紀錄")} </th><th> {t("時間")} </th><th> {t("審核")} </th></tr></thead>
        <tbody>{attendancePage.items.map(event => <tr key={event.id}>
          <td data-label={t("員工")}>{name(event.profileId)}</td><td data-label={t("紀錄")}>{t(label(event.kind))}</td>
          <td data-label={t("時間")}>{new Date(event.correctedAt ?? event.occurredAt).toLocaleString("zh-TW")}</td>
          <td data-label={t("審核")}><button disabled={busy} onClick={() => {
            const value = prompt(t("更正後時間（含時區，例如 2026-10-21T09:00:00+08:00）"), event.occurredAt);
            const reason = value && prompt(t("更正原因"));
            if (value && reason) void act({ action: "CORRECT_CLOCK", eventId: event.id,
              correctedAt: new Date(value).toISOString(), reason });
          }}> {t("更正")} </button>{event.kind === "CLOCK_IN" && <button disabled={busy}
            onClick={() => {
              const minutes = Number(prompt(t("核准加班分鐘數")));
              const reason = minutes > 0 && prompt(t("核准原因"));
              if (reason) void act({ action: "APPROVE_OVERTIME",
                clockInEventId: event.id, approvedMinutes: minutes, reason });
            }}> {t("核准加班")} </button>}</td>
        </tr>)}</tbody></table>
      {attendancePage.pager}
    </section>
    <section hidden={workspaceView !== "reassignment"} aria-label={t("預約改派")}>
      <h2> {t("預約改派")} </h2>
      {workspaceView === "reassignment" && <QualificationReview key={query} query={query} staff={data?.staff ?? []} />}
      <details><summary> {t("手動檢視其他預約")} </summary>
      <label> {t("原美容師")} <select value={sourceStaffId}
        onChange={event => setSourceStaffId(event.target.value)}><option value=""> {t("請選擇")} </option>
        {data?.staff.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <button disabled={!sourceStaffId} onClick={() => void loadFutureBookings()}> {t("查詢預約安排")} </button>
      <label> {t("新美容師")} <select value={targetStaffId}
        onChange={event => setTargetStaffId(event.target.value)}><option value=""> {t("請選擇")} </option>
        {data?.staff.filter(row => row.id !== sourceStaffId).map(row =>
          <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <ul>{futurePage.items.map(booking => <li key={booking.id}>
        {new Date(booking.startsAt).toLocaleString()} · {booking.serviceName} · {booking.staffName}
        <button disabled={busy || !targetStaffId} onClick={() => void reassign(booking.id)}> {t("確認改派")} </button></li>)}</ul>
      {futurePage.pager}
      </details>
    </section>
    <section hidden={workspaceView !== "payroll"} aria-label={t("薪資審核")}>
      <h2> {t("薪資試算")} </h2>
      <label> {t("員工")} <select value={employee} onChange={event => setEmployee(event.target.value)}>
        <option value=""> {t("請選擇")} </option>{data?.employees.map(row =>
          <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label> {t("計算規則")} <select value={rule} onChange={event => setRule(event.target.value)}>
        <option value=""> {t("請選擇")} </option>{data?.rules.map(row =>
          <option key={row.id} value={row.id}>{row.version} · {row.profileId ? name(row.profileId) : t("全體員工")}</option>)}</select></label>
      <label> {t("開始日期")} <input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label> {t("結束日期")} <input type="date" value={until} onChange={event => setUntil(event.target.value)} /></label>
      <button disabled={busy || !employee || !rule || !from || !until}
        onClick={() => void act({ action: "CALCULATE_PAYROLL", employeeId: employee,
          ruleId: rule, from, until })}> {t("產生試算草稿")} </button>
      <table><thead><tr><th> {t("員工")} </th><th> {t("期間")} </th><th> {t("金額")} </th><th> {t("狀態")} </th><th> {t("審核")} </th></tr></thead>
        <tbody>{periodPage.items.map(period => <tr key={period.id}>
          <td data-label={t("員工")}>{name(period.profileId)}</td><td data-label={t("期間")}>{period.from.slice(0,10)}–{period.until.slice(0,10)}</td>
          <td data-label={t("金額")}>{money(period.totalMinor)}</td><td data-label={t("狀態")}>{t(label(period.status))} {t("· 第")} {period.revision} {t("版")} </td>
          <td data-label={t("審核")}><button onClick={() => void showPayslip(period.id)}> {t("查看明細")} </button>
            {period.status === "DRAFT" && <button disabled={busy} onClick={() => {
              const reviewReason = prompt(t("審核原因（有暫扣工時時必填）")) ?? "";
              void act({ action: "APPROVE_PAYROLL", periodId: period.id, reviewReason });
            }}> {t("核准")} </button>}</td>
        </tr>)}</tbody></table>
      {periodPage.pager}
      {payslip && <section aria-label={t("薪資明細")}><h3> {t("薪資明細")} </h3>
        <p>{payslip.from} {t("至")} {payslip.until} · {t(label(payslip.status))}</p>
        <strong>{money(payslip.totalMinor)}</strong>
        <ul className={styles.resultList}>{payslipPage.items.map((line, index) => <li key={index}>
          <span>{t(label(line.kind))}{line.minutes !== null && ` · ${line.minutes} ${t("分鐘")}`}</span>
          <strong>{money(line.amountMinor)}</strong></li>)}</ul>
        {payslipPage.pager}
      </section>}
      <details><summary> {t("下期退款調整")} </summary>
      <label> {t("退款編號")} <input value={refundId} onChange={event => setRefundId(event.target.value)} /></label>
      <label> {t("生效日期")} <input type="date" value={adjustDate}
        onChange={event => setAdjustDate(event.target.value)} /></label>
      <p> {t("原始已核准薪資期間")} </p>
      {approvedPage.items.map(period =>
        <button key={period.id} disabled={busy || !refundId || !adjustDate}
          onClick={() => void act({ action: "ADJUST_REFUND", originalPeriodId: period.id,
            bookingRefundId: refundId, appliesOn: adjustDate,
            idempotencyKey: requestId() })}> {t("調整")} {name(period.profileId)} {period.from.slice(0,10)}</button>)}
      {approvedPage.pager}
      </details>
    </section>
    <section hidden={workspaceView !== "benefits"} aria-label={t("會員權益與抽成")}>
      <h2> {t("會員結帳")} </h2>
      <p> {t("測試模式 · 不執行實際款項交易")} </p>
      <label> {t("顧客編號")} <input value={customerId}
        disabled={busy} onChange={event => { setCustomerId(event.target.value); setBenefitResult(null); setMarketingConsent(null); }} /></label>
      <button disabled={busy || !customerId} onClick={() => void previewBenefit("customerId",customerId)}> {t("查看餘額與權益")} </button>
      {benefitResult !== null && <BenefitResult value={benefitResult} timezone={timezone} />}
      <details><summary> {t("行銷同意")} </summary>
      <p> {t("預約通知與行銷同意分開管理。")} </p>
      <button disabled={!customerId} onClick={() => void reviewMarketingConsent()}> {t("查看行銷同意")} </button>
      {marketingConsent && <div aria-label={t("行銷同意紀錄")}>
        <p> {t("目前狀態：")} {marketingConsent.currentlyGranted ? t("已同意") : t("未同意")}</p>
        {marketingConsent.history.length === 0 ? <p> {t("尚無行銷同意紀錄")} </p> :
          <ul>{consentPage.items.map((entry,index) => <li key={index}>
            {t(label(entry.status))} · {new Date(entry.capturedAt).toLocaleString("zh-TW")} {t("· 政策版本")} {entry.policyVersion}</li>)}</ul>}
        {consentPage.pager}
      </div>}
      </details>
      <details><summary> {t("顧客預約權限")} </summary>
      <label> {t("狀態")} <select aria-label={t("狀態")} value={statusKind}
        onChange={event => setStatusKind(event.target.value as "VIP" | "BLACKLIST")}>
        <option value="VIP"> {t("貴賓")} </option><option value="BLACKLIST"> {t("黑名單")} </option>
      </select></label>
      <label> {t("適用範圍")} <select value={statusScope}
        onChange={event => setStatusScope(event.target.value as "LOCATION" | "ORGANIZATION")}>
        <option value="LOCATION"> {t("本分店")} </option>
        <option value="ORGANIZATION"> {t("全部分店")} </option>
      </select></label>
      <label> {t("原因")} <input value={statusReason}
        onChange={event => setStatusReason(event.target.value)} /></label>
      <button disabled={busy || !customerId || !statusReason.trim()}
        onClick={() => void changeCustomerStatus(true)}> {t("啟用狀態")} </button>
      <button disabled={busy || !customerId || !statusReason.trim()}
        onClick={() => void changeCustomerStatus(false)}> {t("解除狀態")} </button>
      </details>
      <details><summary> {t("發放與管理權益")} </summary>
      <label> {t("權益種類")} <select value={benefitKind}
        onChange={event => setBenefitKind(event.target.value as "COUPON" | "SERVICE_PACKAGE")}>
        <option value="COUPON"> {t("優惠券")} </option><option value="SERVICE_PACKAGE"> {t("服務套票")} </option>
      </select></label>
      <label> {t("數量")} <input type="number" min="1" value={quantity}
        onChange={event => setQuantity(Number(event.target.value))} /></label>
      {benefitKind === "COUPON" ? <label> {t("折抵金額（分）")} <input type="number" min="1"
        value={discountMinor} onChange={event => setDiscountMinor(Number(event.target.value))} /></label> :
        <label> {t("服務規格編號")} <input value={serviceVariantId}
          onChange={event => setServiceVariantId(event.target.value)} /></label>}
      <button disabled={busy || !customerId || quantity < 1}
        onClick={() => void benefitRequest({ action: "ISSUE", customerId,
          kind: benefitKind, quantity, ...(benefitKind === "COUPON" ?
            { discountMinor } : { serviceVariantId }), idempotencyKey: requestId() })}> {t("發放測試權益")} </button>
      <label> {t("預約編號")} <input value={bookingId} onChange={event => setBookingId(event.target.value)} /></label>
      <label> {t("權益發放編號")} <input value={issueId} onChange={event => setIssueId(event.target.value)} /></label>
      {(["RESERVE","REDEEM","RELEASE","CANCEL"] as const).map(action =>
        <button key={action} disabled={busy || !customerId || !bookingId || !issueId}
          onClick={() => void benefitRequest({ action, customerId, bookingId,
            issueId, quantity, idempotencyKey: requestId() })}>{t(label(action))}</button>)}
      <label> {t("已確認退款編號")} <input value={refundId}
        onChange={event => setRefundId(event.target.value)} /></label>
      <button disabled={busy || !customerId || !bookingId || !issueId || !refundId}
        onClick={() => void benefitRequest({ action: "REFUND", customerId,
          bookingId, issueId, bookingRefundId: refundId, quantity,
          idempotencyKey: requestId() })}> {t("退還權益")} </button>
      <button disabled={!bookingId} onClick={() => void previewBenefit("bookingId",bookingId)}> {t("試算抽成")} </button>
      </details>
      <details><summary> {t("優惠結帳")} </summary>
      <label> {t("預約編號")} <input value={bookingId} onChange={event => setBookingId(event.target.value)} /></label>
      <label> {t("預約版本")} <input type="number" min="1" value={bookingVersion}
        onChange={event => setBookingVersion(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={relationshipAttested}
        onChange={event => setRelationshipAttested(event.target.checked)} /> {t("櫃台已確認優惠資格")} </label>
      <button disabled={busy || !bookingId} onClick={() => void promotion("PREVIEW")}> {t("試算金額")} </button>
      <button disabled={busy || !bookingId} onClick={() => void promotion("APPLY")}> {t("套用測試金額")} </button>
      </details>
      <details><summary> {t("優惠與抽成規則")} </summary>
      <p> {t("同優先順序的規則不可有重疊生效期間。")} </p>
      <label> {t("規則代碼（英文大寫、數字或底線）")} <input value={ruleKey}
        onChange={event => setRuleKey(event.target.value.toUpperCase())} /></label>
      <label> {t("版本")} <input type="number" min="1" value={ruleVersion}
        onChange={event => setRuleVersion(Number(event.target.value))} /></label>
      <label> {t("優先順序")} <input type="number" value={rulePriority}
        onChange={event => setRulePriority(Number(event.target.value))} /></label>
      <label> {t("開始日期")} <input type="datetime-local" value={ruleFrom}
        onChange={event => setRuleFrom(event.target.value)} /></label>
      <label> {t("結束日期")} <input type="datetime-local" value={ruleUntil}
        onChange={event => setRuleUntil(event.target.value)} /></label>
      <label> {t("服務規格編號（選填）")} <input value={ruleVariant}
        onChange={event => setRuleVariant(event.target.value)} /></label>
      <label> {t("優惠類型")} <select value={promotionKind}
        onChange={event => setPromotionKind(event.target.value as typeof promotionKind)}>
        {(["SEASONAL","MOTHERS_DAY","BIRTHDAY","VIP"] as const).map(kind =>
          <option key={kind} value={kind}>{t(label(kind))}</option>)}</select></label>
      <label> {t("折扣百分比")} <input type="number" min="1" max="100" value={discountPercent}
        onChange={event => setDiscountPercent(Number(event.target.value))} /></label>
      <button disabled={busy || !ruleKey || !ruleFrom || !ruleUntil}
        onClick={() => void benefitRequest({ action: "CREATE_PROMOTION",
          policyKey: ruleKey, version: ruleVersion, priority: rulePriority,
          kind: promotionKind, discountPercent, maxDiscountMinor: null,
          serviceVariantId: ruleVariant || null,
          effectiveFrom: new Date(ruleFrom).toISOString(),
          effectiveUntil: new Date(ruleUntil).toISOString(),
          attestationRequired: promotionKind === "MOTHERS_DAY" })}> {t("建立優惠草稿")} </button>
      <label> {t("抽成基準")} <select value={commissionBasis}
        onChange={event => setCommissionBasis(event.target.value as typeof commissionBasis)}>
        {(["ORIGINAL","DISCOUNTED","PAID_COMPONENT","FIXED"] as const).map(basis =>
          <option key={basis} value={basis}>{t(label(basis))}</option>)}</select></label>
      <label>{commissionBasis === "FIXED" ? t("固定金額（分）") : t("抽成比例（萬分比）")}
        <input type="number" min="0" value={commissionAmount}
          onChange={event => setCommissionAmount(Number(event.target.value))} /></label>
      <button disabled={busy || !ruleKey || !ruleFrom || !ruleUntil}
        onClick={() => void benefitRequest({ action: "CREATE_COMMISSION",
          ruleKey, version: ruleVersion, priority: rulePriority,
          basis: commissionBasis,
          rateBps: commissionBasis === "FIXED" ? null : commissionAmount,
          fixedMinor: commissionBasis === "FIXED" ? commissionAmount : null,
          serviceVariantId: ruleVariant || null, staffProfileId: null,
          excludeFeeTax: false,
          effectiveFrom: new Date(ruleFrom).toISOString(),
          effectiveUntil: new Date(ruleUntil).toISOString() })}> {t("建立抽成草稿")} </button>
      <button onClick={() => void loadPolicies()}> {t("載入規則草稿")} </button>
      {promotionPage.items.map(policy => <p key={policy.id}>{policy.policyKey} {t("· 第")} {policy.version} {t("版")} {policy.publishedAt ? t("· 已發布") : <button disabled={busy} onClick={() =>
          void benefitRequest({ action: "PUBLISH_PROMOTION", policyId: policy.id })}> {t("發布優惠")} </button>}</p>)}
      {promotionPage.pager}
      {commissionPage.items.map(rule => <p key={rule.id}>{t(label(rule.basis))} {t("· 第")} {rule.version} {t("版")} {rule.publishedAt ? t("· 已發布") : <button disabled={busy} onClick={() =>
          void benefitRequest({ action: "PUBLISH_COMMISSION", ruleId: rule.id })}> {t("發布抽成")} </button>}</p>)}
      {commissionPage.pager}
      </details>
    </section>
    <section hidden={workspaceView !== "timing"} aria-label={t("現場排程設定")}>
      <h2> {t("現場排程")} </h2>
      <p> {t("現場預約時間")} </p>
      <button disabled={busy} onClick={() => void walkinRequest("GET")}> {t("載入排程設定")} </button>
      <p>{walkin ? `${t("已發布版本")} ${walkin.version}` : t("尚未載入排程設定")}</p>
      <label> {t("最早可開始時間（幾分鐘後）")} <input type="number" min="0" max="1440"
        value={walkinEarliest} onChange={event => setWalkinEarliest(Number(event.target.value))} /></label>
      <label> {t("準備緩衝時間（分鐘）")} <input type="number" min="0" max="240"
        value={walkinBuffer} onChange={event => setWalkinBuffer(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={walkinOnlineLead}
        onChange={event => setWalkinOnlineLead(event.target.checked)} /> {t("套用線上預約最短提前時間")} </label>
      <button disabled={busy} onClick={() => void walkinRequest("PATCH")}> {t("儲存排程設定")} </button>
    </section>
    <section hidden={workspaceView !== "allocation"} aria-label={t("多人抽成分配")}>
      <h2> {t("多人抽成")} </h2>
      <p> {t("測試模式 · 金額單位為分")} </p>
      <label> {t("已完成服務項目編號")} <input value={allocationSegment}
        onChange={event => { setAllocationSegment(event.target.value); setAllocationPreview(null); }} /></label>
      <label> {t("分配方式")} <select value={allocationMethod} onChange={event => {
        setAllocationMethod(event.target.value as typeof allocationMethod);
        setAllocationPreview(null);
      }}><option value="PERCENT"> {t("依比例（萬分比）")} </option>
        <option value="FIXED"> {t("固定金額（分）")} </option></select></label>
      {allocationLines.map((line,index) => <div key={index}>
        <label> {t("服務人員")} {index+1} {t("編號")} <input value={line.staffProfileId}
          onChange={event => setAllocationLines(previous => previous.map((item,i) =>
            i === index ? { ...item, staffProfileId: event.target.value } : item))} /></label>
        <label>{allocationMethod === "PERCENT" ? t("分配比例（萬分比）") : t("固定金額（分）")}
          <input type="number" min="0" value={line.amount} onChange={event =>
            setAllocationLines(previous => previous.map((item,i) =>
              i === index ? { ...item, amount: Number(event.target.value) } : item))} /></label>
        <button type="button" disabled={allocationLines.length <= 2} onClick={() =>
          setAllocationLines(previous => previous.filter((_,i) => i !== index))}> {t("移除")} </button>
      </div>)}
      <button type="button" onClick={() => setAllocationLines(previous => [...previous,
        { staffProfileId: "", amount: 0 }])}> {t("新增服務人員")} </button>
      <button disabled={busy || !allocationSegment} onClick={() =>
        void allocationRequest(false)}> {t("試算分配")} </button>
      {allocationPreview && <><h3> {t("分配預覽 · 第")} {allocationPreview.version} {t("版")} </h3>
        <p> {t("可分配抽成")} {money(allocationPreview.commissionPoolMinor)}</p>
        <ul className={styles.resultList}>{allocationPreview.lines.map(line => <li key={line.staffProfileId}>
          <span>{data?.staff.find(person => person.id === line.staffProfileId)?.name ?? t("服務人員")}</span>
          <strong>{money(line.quotedMinor)}</strong></li>)}</ul>
        <button disabled={busy} onClick={() => void allocationRequest(true)}> {t("發布分配版本")} </button></>}
    </section>
  </main></MerchantShell>;
}

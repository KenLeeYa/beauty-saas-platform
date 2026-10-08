"use client";

import { useEffect, useState } from "react";
import { requestId } from "@/lib/line-booking/request-id";
import { Clock, CalendarClock, Wallet, Gift, Shuffle, UsersRound } from "lucide-react";
import styles from "./review.module.css";

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

function csrfToken() {
  const cookie = document.cookie.split("; ").find(item => item.startsWith("beauty_csrf="));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

export function OperationsReview({ organization, location }: {
  organization: string; location: string }) {
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
  const [payslip, setPayslip] = useState<unknown>(null);
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
  useEffect(() => {
    let active = true;
    fetch(`/api/merchant/operations?${query}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Envelope<ReviewData>;
        if (active) setData(result.data ?? null);
      }).catch(() => { if (active) setMessage("Unable to load review data"); });
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
      if (!response.ok) throw Error(result.error?.message || "Operation failed");
      setMessage("Saved"); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed"); }
    finally { setBusy(false); }
  }
  async function showPayslip(periodId: string) {
    const response = await fetch(`/api/merchant/operations?${query}&periodId=${periodId}`);
    const result = await response.json() as Envelope<{ payslip: unknown }>;
    setPayslip(result.data?.payslip ?? null);
  }
  async function benefitRequest(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/benefits?${query}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() }, body: JSON.stringify(body),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "Benefit operation failed");
      setBenefitResult(result.data); setMessage("Saved");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Benefit operation failed"); }
    finally { setBusy(false); }
  }
  async function previewBenefit(key: "customerId" | "bookingId", value: string) {
    const response = await fetch(`/api/merchant/benefits?${query}&${key}=${encodeURIComponent(value)}`);
    const result = await response.json() as Envelope<unknown>;
    setBenefitResult(result.data ?? result.error ?? null);
  }
  async function promotion(mode: "PREVIEW" | "APPLY") {
    if (busy || !bookingId) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/bookings/promotion?${query}`, {
        method: "POST", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        body: JSON.stringify({ mode, bookingId, relationshipAttested,
          ...(mode === "APPLY" ? { expectedVersion: bookingVersion } : {}) }),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "Promotion quote failed");
      setBenefitResult(result.data); setMessage(mode === "APPLY" ? "Checkout price saved" : "Quote ready");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Promotion quote failed"); }
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
    if (!response.ok) setMessage(result.error?.message || "Cannot load future bookings");
  }
  async function reassign(bookingId: string) {
    const reason = prompt("Reason for reassignment");
    if (!reason || !targetStaffId || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/merchant/bookings/reassign?${query}`, {
        method: "PATCH", headers: { "content-type": "application/json",
          "x-csrf-token": csrfToken() },
        body: JSON.stringify({ bookingId, targetStaffId, reason }),
      });
      const result = await response.json() as Envelope<unknown>;
      if (!response.ok) throw Error(result.error?.message || "Reassignment failed");
      setMessage("Booking reassigned"); await loadFutureBookings();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reassignment failed"); }
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
      if (!response.ok) throw Error(result.error?.message || "Status change failed");
      setMessage("Customer status saved");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Status change failed"); }
    finally { setBusy(false); }
  }
  async function reviewMarketingConsent() {
    if (!customerId) return;
    const response = await fetch(`/api/merchant/customers/marketing-consent?${query}`+
      `&customerId=${encodeURIComponent(customerId)}`,{ cache:"no-store" });
    const result = await response.json() as Envelope<{ consent:typeof marketingConsent }>;
    if (!response.ok) { setMessage(result.error?.message ?? "Consent review failed"); return; }
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
      if (!response.ok) throw Error(result.error?.message || "Walk-in policy failed");
      setWalkin(result.data?.policy ?? null);
      if (result.data?.policy) {
        setWalkinEarliest(result.data.policy.earliestStartMinutes);
        setWalkinBuffer(result.data.policy.setupBufferMinutes);
        setWalkinOnlineLead(result.data.policy.onlineMinimumAdvanceApplies);
      }
      setMessage(method === "PATCH" ? "Walk-in policy saved" : "Policy loaded");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Policy failed"); }
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
      if (!response.ok) throw Error(result.error?.message || "Allocation failed");
      setAllocationPreview(result.data?.preview ?? result.data?.allocation ?? null);
      setMessage(publish ? "Allocation version published" : "Allocation preview ready");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Allocation failed"); }
    finally { setBusy(false); }
  }
  const name = (profileId: string) => data?.employees.find(row => row.id === profileId)?.name ?? profileId;
  return <main className={styles.workspace} style={{ maxWidth: 1080, margin: "2rem auto", padding: "1rem", fontFamily: "sans-serif" }}>
    <a href={`/merchant/dashboard?${query}`}>← Merchant dashboard</a>
    <h1>Operations review</h1>
    <p>Location: {location}. Attendance corrections and payroll approvals preserve their source history.</p>
    {message && <p role="status">{message}</p>}
    <nav aria-label="營運工作區" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:16}}>
      {[{id:"timing",label:"現場排程",icon:CalendarClock},{id:"benefits",label:"會員結帳",icon:Gift},
        {id:"attendance",label:"出勤紀錄",icon:Clock},{id:"payroll",label:"薪資試算",icon:Wallet},
        {id:"reassignment",label:"預約改派",icon:Shuffle},{id:"allocation",label:"多人抽成",icon:UsersRound}].map(item =>
        <button key={item.id} type="button" aria-current={workspaceView===item.id ? "page" : undefined}
          onClick={()=>setWorkspaceView(item.id)} style={{minHeight:44,display:"flex",alignItems:"center",gap:8,padding:8,
            background:workspaceView===item.id ? "#e7f3f2" : "#fff",border:"1px solid #d8e0e6",borderRadius:4}}>
          <item.icon size={20} aria-hidden="true"/>{item.label}</button>)}
    </nav>
    <section hidden={workspaceView !== "attendance"} aria-label="Attendance review">
      <h2>Attendance</h2>
      <a href={`/api/merchant/operations?${query}&format=csv`}>Download attendance CSV</a>
      <table><thead><tr><th>Employee</th><th>Event</th><th>Time</th><th>Review</th></tr></thead>
        <tbody>{data?.attendance.map(event => <tr key={event.id}>
          <td>{name(event.profileId)}</td><td>{event.kind}</td>
          <td>{new Date(event.correctedAt ?? event.occurredAt).toLocaleString()}</td>
          <td><button disabled={busy} onClick={() => {
            const value = prompt("Corrected ISO time", event.occurredAt);
            const reason = value && prompt("Correction reason");
            if (value && reason) void act({ action: "CORRECT_CLOCK", eventId: event.id,
              correctedAt: new Date(value).toISOString(), reason });
          }}>Correct</button>{event.kind === "CLOCK_IN" && <button disabled={busy}
            onClick={() => {
              const minutes = Number(prompt("Approved overtime minutes"));
              const reason = minutes > 0 && prompt("Approval reason");
              if (reason) void act({ action: "APPROVE_OVERTIME",
                clockInEventId: event.id, approvedMinutes: minutes, reason });
            }}>Approve overtime</button>}</td>
        </tr>)}</tbody></table>
    </section>
    <section hidden={workspaceView !== "reassignment"} aria-label="Future booking reassignment">
      <h2>Future booking reassignment</h2>
      <label>Current beautician <select value={sourceStaffId}
        onChange={event => setSourceStaffId(event.target.value)}><option value="">Select</option>
        {data?.staff.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <button disabled={!sourceStaffId} onClick={() => void loadFutureBookings()}>
        Review assignments</button>
      <label>New beautician <select value={targetStaffId}
        onChange={event => setTargetStaffId(event.target.value)}><option value="">Select</option>
        {data?.staff.filter(row => row.id !== sourceStaffId).map(row =>
          <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <ul>{futureBookings.map(booking => <li key={booking.id}>
        {new Date(booking.startsAt).toLocaleString()} · {booking.serviceName} · {booking.staffName}
        <button disabled={busy || !targetStaffId} onClick={() => void reassign(booking.id)}>
          Reassign</button></li>)}</ul>
    </section>
    <section hidden={workspaceView !== "payroll"} aria-label="Payroll review">
      <h2>Payroll shadow calculation</h2>
      <label>Employee <select value={employee} onChange={event => setEmployee(event.target.value)}>
        <option value="">Select</option>{data?.employees.map(row =>
          <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Rule <select value={rule} onChange={event => setRule(event.target.value)}>
        <option value="">Select</option>{data?.rules.map(row =>
          <option key={row.id} value={row.id}>{row.version} · {row.profileId ?? "All staff"}</option>)}</select></label>
      <label>From <input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Until <input type="date" value={until} onChange={event => setUntil(event.target.value)} /></label>
      <button disabled={busy || !employee || !rule || !from || !until}
        onClick={() => void act({ action: "CALCULATE_PAYROLL", employeeId: employee,
          ruleId: rule, from, until })}>Calculate draft</button>
      <table><thead><tr><th>Employee</th><th>Period</th><th>Amount</th><th>Status</th><th>Review</th></tr></thead>
        <tbody>{data?.periods.map(period => <tr key={period.id}>
          <td>{name(period.profileId)}</td><td>{period.from.slice(0,10)}–{period.until.slice(0,10)}</td>
          <td>{period.totalMinor}</td><td>{period.status} #{period.revision}</td>
          <td><button onClick={() => void showPayslip(period.id)}>Lines</button>
            {period.status === "DRAFT" && <button disabled={busy} onClick={() => {
              const reviewReason = prompt("Approval review reason (required if time is withheld)") ?? "";
              void act({ action: "APPROVE_PAYROLL", periodId: period.id, reviewReason });
            }}>Approve</button>}</td>
        </tr>)}</tbody></table>
      {payslip !== null && <pre aria-label="Payslip lines">{JSON.stringify(payslip,null,2)}</pre>}
      <h3>Next-period refund adjustment</h3>
      <label>Refund ID <input value={refundId} onChange={event => setRefundId(event.target.value)} /></label>
      <label>Applies on <input type="date" value={adjustDate}
        onChange={event => setAdjustDate(event.target.value)} /></label>
      <p>Select an approved period above as the source:</p>
      {data?.periods.filter(period => period.status === "APPROVED").map(period =>
        <button key={period.id} disabled={busy || !refundId || !adjustDate}
          onClick={() => void act({ action: "ADJUST_REFUND", originalPeriodId: period.id,
            bookingRefundId: refundId, appliesOn: adjustDate,
            idempotencyKey: requestId() })}>Adjust {name(period.profileId)} {period.from.slice(0,10)}</button>)}
    </section>
    <section hidden={workspaceView !== "benefits"} aria-label="Benefit and commission review">
      <h2>Benefits and commission preview</h2>
      <p>New issuance and changes run only in the synthetic test environment.</p>
      <label>Customer ID <input value={customerId}
        onChange={event => setCustomerId(event.target.value)} /></label>
      <button disabled={!customerId} onClick={() => void previewBenefit("customerId",customerId)}>
        View balance and benefits</button>
      <h3>Marketing consent review</h3>
      <p>Transactional booking notices are separate from optional marketing consent.
        No marketing message is sent from this screen.</p>
      <button disabled={!customerId} onClick={() => void reviewMarketingConsent()}>
        Review marketing consent</button>
      {marketingConsent && <div aria-label="Marketing consent history">
        <p>Current status: {marketingConsent.currentlyGranted ? "Granted" : "Not granted"}</p>
        {marketingConsent.history.length === 0 ? <p>No recorded marketing consent.</p> :
          <ul>{marketingConsent.history.map((entry,index) => <li key={index}>
            {entry.status} · {new Date(entry.capturedAt).toLocaleString()} ·
            {entry.source} · policy {entry.policyVersion}</li>)}</ul>}
      </div>}
      <h3>Customer booking status</h3>
      <label>Status <select value={statusKind}
        onChange={event => setStatusKind(event.target.value as "VIP" | "BLACKLIST")}>
        <option value="VIP">VIP</option><option value="BLACKLIST">Booking block</option>
      </select></label>
      <label>Scope <select value={statusScope}
        onChange={event => setStatusScope(event.target.value as "LOCATION" | "ORGANIZATION")}>
        <option value="LOCATION">This location</option>
        <option value="ORGANIZATION">Entire organization</option>
      </select></label>
      <label>Reason <input value={statusReason}
        onChange={event => setStatusReason(event.target.value)} /></label>
      <button disabled={busy || !customerId || !statusReason.trim()}
        onClick={() => void changeCustomerStatus(true)}>Enable status</button>
      <button disabled={busy || !customerId || !statusReason.trim()}
        onClick={() => void changeCustomerStatus(false)}>Clear status</button>
      <label>Benefit <select value={benefitKind}
        onChange={event => setBenefitKind(event.target.value as "COUPON" | "SERVICE_PACKAGE")}>
        <option value="COUPON">Coupon</option><option value="SERVICE_PACKAGE">Service package</option>
      </select></label>
      <label>Quantity <input type="number" min="1" value={quantity}
        onChange={event => setQuantity(Number(event.target.value))} /></label>
      {benefitKind === "COUPON" ? <label>Discount in minor units <input type="number" min="1"
        value={discountMinor} onChange={event => setDiscountMinor(Number(event.target.value))} /></label> :
        <label>Service variant ID <input value={serviceVariantId}
          onChange={event => setServiceVariantId(event.target.value)} /></label>}
      <button disabled={busy || !customerId || quantity < 1}
        onClick={() => void benefitRequest({ action: "ISSUE", customerId,
          kind: benefitKind, quantity, ...(benefitKind === "COUPON" ?
            { discountMinor } : { serviceVariantId }), idempotencyKey: requestId() })}>
        Issue synthetic benefit</button>
      <label>Booking ID <input value={bookingId} onChange={event => setBookingId(event.target.value)} /></label>
      <label>Issue ID <input value={issueId} onChange={event => setIssueId(event.target.value)} /></label>
      {(["RESERVE","REDEEM","RELEASE","CANCEL"] as const).map(action =>
        <button key={action} disabled={busy || !customerId || !bookingId || !issueId}
          onClick={() => void benefitRequest({ action, customerId, bookingId,
            issueId, quantity, idempotencyKey: requestId() })}>{action}</button>)}
      <label>Confirmed refund ID <input value={refundId}
        onChange={event => setRefundId(event.target.value)} /></label>
      <button disabled={busy || !customerId || !bookingId || !issueId || !refundId}
        onClick={() => void benefitRequest({ action: "REFUND", customerId,
          bookingId, issueId, bookingRefundId: refundId, quantity,
          idempotencyKey: requestId() })}>Refund benefit</button>
      <button disabled={!bookingId} onClick={() => void previewBenefit("bookingId",bookingId)}>
        Preview commission</button>
      <h3>Promotion checkout</h3>
      <label>Booking version <input type="number" min="1" value={bookingVersion}
        onChange={event => setBookingVersion(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={relationshipAttested}
        onChange={event => setRelationshipAttested(event.target.checked)} />
        Relationship attested by front desk</label>
      <button disabled={busy || !bookingId} onClick={() => void promotion("PREVIEW")}>Preview price</button>
      <button disabled={busy || !bookingId} onClick={() => void promotion("APPLY")}>Apply synthetic price</button>
      <h3>Rule publication review</h3>
      <p>Create a draft with an effective interval. Publication rejects overlapping priority rules.</p>
      <label>Rule key (A-Z, 0-9, underscore) <input value={ruleKey}
        onChange={event => setRuleKey(event.target.value.toUpperCase())} /></label>
      <label>Version <input type="number" min="1" value={ruleVersion}
        onChange={event => setRuleVersion(Number(event.target.value))} /></label>
      <label>Priority <input type="number" value={rulePriority}
        onChange={event => setRulePriority(Number(event.target.value))} /></label>
      <label>From <input type="datetime-local" value={ruleFrom}
        onChange={event => setRuleFrom(event.target.value)} /></label>
      <label>Until <input type="datetime-local" value={ruleUntil}
        onChange={event => setRuleUntil(event.target.value)} /></label>
      <label>Service variant ID (optional) <input value={ruleVariant}
        onChange={event => setRuleVariant(event.target.value)} /></label>
      <label>Promotion kind <select value={promotionKind}
        onChange={event => setPromotionKind(event.target.value as typeof promotionKind)}>
        {(["SEASONAL","MOTHERS_DAY","BIRTHDAY","VIP"] as const).map(kind =>
          <option key={kind} value={kind}>{kind}</option>)}</select></label>
      <label>Discount percent <input type="number" min="1" max="100" value={discountPercent}
        onChange={event => setDiscountPercent(Number(event.target.value))} /></label>
      <button disabled={busy || !ruleKey || !ruleFrom || !ruleUntil}
        onClick={() => void benefitRequest({ action: "CREATE_PROMOTION",
          policyKey: ruleKey, version: ruleVersion, priority: rulePriority,
          kind: promotionKind, discountPercent, maxDiscountMinor: null,
          serviceVariantId: ruleVariant || null,
          effectiveFrom: new Date(ruleFrom).toISOString(),
          effectiveUntil: new Date(ruleUntil).toISOString(),
          attestationRequired: promotionKind === "MOTHERS_DAY" })}>
        Create promotion draft</button>
      <label>Commission basis <select value={commissionBasis}
        onChange={event => setCommissionBasis(event.target.value as typeof commissionBasis)}>
        {(["ORIGINAL","DISCOUNTED","PAID_COMPONENT","FIXED"] as const).map(basis =>
          <option key={basis} value={basis}>{basis}</option>)}</select></label>
      <label>{commissionBasis === "FIXED" ? "Fixed minor units" : "Rate basis points"}
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
          effectiveUntil: new Date(ruleUntil).toISOString() })}>
        Create commission draft</button>
      <button onClick={() => void loadPolicies()}>Load draft rules</button>
      {policies?.promotions.map(policy => <p key={policy.id}>{policy.policyKey} v{policy.version}
        {policy.publishedAt ? " · published" : <button disabled={busy} onClick={() =>
          void benefitRequest({ action: "PUBLISH_PROMOTION", policyId: policy.id })}>
          Publish promotion</button>}</p>)}
      {policies?.commissions.map(rule => <p key={rule.id}>{rule.basis} v{rule.version}
        {rule.publishedAt ? " · published" : <button disabled={busy} onClick={() =>
          void benefitRequest({ action: "PUBLISH_COMMISSION", ruleId: rule.id })}>
          Publish commission</button>}</p>)}
      {benefitResult !== null && <pre aria-label="Benefit result">{JSON.stringify(benefitResult,null,2)}</pre>}
    </section>
    <section hidden={workspaceView !== "timing"} aria-label="Walk-in timing policy">
      <h2>Walk-in timing</h2>
      <p>Immediate dispatch requires a saved store policy. The online booking lead
        time can also apply to walk-ins.</p>
      <button disabled={busy} onClick={() => void walkinRequest("GET")}>Load timing policy</button>
      <p>{walkin ? `Published version ${walkin.version}` : "No policy loaded or configured"}</p>
      <label>Earliest start, minutes from now <input type="number" min="0" max="1440"
        value={walkinEarliest} onChange={event => setWalkinEarliest(Number(event.target.value))} /></label>
      <label>Preparation buffer, minutes <input type="number" min="0" max="240"
        value={walkinBuffer} onChange={event => setWalkinBuffer(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={walkinOnlineLead}
        onChange={event => setWalkinOnlineLead(event.target.checked)} />
        Apply online minimum advance time</label>
      <button disabled={busy} onClick={() => void walkinRequest("PATCH")}>Save timing policy</button>
    </section>
    <section hidden={workspaceView !== "allocation"} aria-label="Multi-provider commission allocation">
      <h2>Multi-provider commission</h2>
      <p>Preview and publish an explicit split before calculating payroll. Amounts are
        local test minor units; published versions are audited.</p>
      <label>Completed booking segment ID <input value={allocationSegment}
        onChange={event => { setAllocationSegment(event.target.value); setAllocationPreview(null); }} /></label>
      <label>Method <select value={allocationMethod} onChange={event => {
        setAllocationMethod(event.target.value as typeof allocationMethod);
        setAllocationPreview(null);
      }}><option value="PERCENT">Percent (basis points)</option>
        <option value="FIXED">Fixed minor units</option></select></label>
      {allocationLines.map((line,index) => <div key={index}>
        <label>Provider {index+1} staff ID <input value={line.staffProfileId}
          onChange={event => setAllocationLines(previous => previous.map((item,i) =>
            i === index ? { ...item, staffProfileId: event.target.value } : item))} /></label>
        <label>{allocationMethod === "PERCENT" ? "Share basis points" : "Fixed minor units"}
          <input type="number" min="0" value={line.amount} onChange={event =>
            setAllocationLines(previous => previous.map((item,i) =>
              i === index ? { ...item, amount: Number(event.target.value) } : item))} /></label>
        <button type="button" disabled={allocationLines.length <= 2} onClick={() =>
          setAllocationLines(previous => previous.filter((_,i) => i !== index))}>Remove</button>
      </div>)}
      <button type="button" onClick={() => setAllocationLines(previous => [...previous,
        { staffProfileId: "", amount: 0 }])}>Add provider</button>
      <button disabled={busy || !allocationSegment} onClick={() =>
        void allocationRequest(false)}>Preview split</button>
      {allocationPreview && <><pre>{JSON.stringify(allocationPreview,null,2)}</pre>
        <button disabled={busy} onClick={() => void allocationRequest(true)}>
          Publish allocation version</button></>}
    </section>
  </main>;
}

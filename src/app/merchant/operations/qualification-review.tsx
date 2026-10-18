"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Shuffle } from "lucide-react";
import type { listQualificationReviews } from "@/server/booking/qualification-review";
import { formatLocalDateTime } from "@/lib/presentation/date-time";
import styles from "./review.module.css";

type Review = Awaited<ReturnType<typeof listQualificationReviews>>;

export function QualificationReview({ query, staff }: {
  query: string; staff: Array<{ id: string; name: string }>;
}) {
  const [data, setData] = useState<Review | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Review["items"][number] | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const targetControl = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (selected) targetControl.current?.focus();
  }, [selected]);
  const load = useCallback(async (signal?: AbortSignal) => {
      const response = await fetch(`/api/merchant/bookings/reassign?${query}&review=qualification&offset=${offset}`,
        { cache: "no-store", signal });
      const result = await response.json() as { data?: Review; error?: { message: string } };
      if (!response.ok || !result.data) throw Error(result.error?.message ?? "無法載入待處理預約");
      return result.data;
  }, [query, offset]);
  function receive(result: Review) {
    setData(result); setSelected(null); setError(""); setLoading(false);
  }
  function fail(cause: unknown) {
    setData(null); setSelected(null); setLoading(false);
    setError(cause instanceof Error ? cause.message : "無法載入待處理預約");
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(result => {
      if (!controller.signal.aborted) receive(result);
    }, cause => { if (!controller.signal.aborted) fail(cause); });
    return () => controller.abort();
  }, [load]);
  function refresh() {
    setLoading(true); setSelected(null);
    void load().then(receive, fail);
  }

  async function confirm() {
    if (!selected || !target || !reason.trim() || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const cookie = document.cookie.split("; ").find(item => item.startsWith("beauty_csrf="));
      const response = await fetch(`/api/merchant/bookings/reassign?${query}`, {
        method: "PATCH", headers: { "content-type": "application/json",
          "x-csrf-token": cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "" },
        body: JSON.stringify({ bookingId: selected.bookingId, expectedVersion: selected.bookingVersion,
          segmentId: selected.segmentId, allocationId: selected.allocationId,
          targetStaffId: target, reason: reason.trim() }),
      });
      const result = await response.json() as { error?: { message: string } };
      if (!response.ok) throw Error(result.error?.message ?? "改派失敗，原預約安排未變更");
      setMessage("已確認改派"); setTarget(""); setReason("");
      receive(await load());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "改派失敗"); }
    finally { setBusy(false); }
  }

  return <div className={styles.qualificationReview} aria-label="資格異動待處理預約" aria-busy={busy || loading}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <h3>資格異動待處理{data ? ` (${data.total})` : ""}</h3>
      <button type="button" aria-label="重新整理待處理預約" title="重新整理待處理預約"
        disabled={busy || loading} onClick={refresh}><RefreshCw size={18} /></button>
    </header>
    {loading && <p role="status">載入中</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!loading && data?.total === 0 && <p>目前沒有資格異動待處理預約</p>}
    {!loading && data && <ul style={{ padding: 0, listStyle: "none" }}>{data.items.map(item =>
      <li key={item.allocationId ?? `${item.segmentId}:${item.staffId}`} data-segment-id={item.segmentId}
        data-allocation-id={item.allocationId} style={{ padding: "12px 0", borderBottom: "1px solid #d8e0e6", overflowWrap: "anywhere" }}>
        <strong>{item.serviceName}</strong>
        <div>{formatLocalDateTime(item.startsAt, data.timezone)}</div>
        <div>{item.staffName} · 資格未涵蓋預約時間</div>
        {item.canReassign ? <button type="button" disabled={busy} onClick={() => {
          setSelected(item); setTarget(""); setReason(""); setError(""); setMessage("");
        }}><Shuffle size={18} aria-hidden="true" /> 選擇改派人員</button>
          : <p>缺少人員時段配置，請先確認原預約資料</p>}
      </li>)}</ul>}
    {selected && <form aria-label="確認資格異動改派" onSubmit={event => { event.preventDefault(); void confirm(); }}>
      <h4>本次替換：{selected.serviceName} · {selected.staffName}</h4>
      <div aria-label="保留安排" style={{ overflowWrap: "anywhere" }}>
        <strong>保留安排</strong>
        {selected.arrangements.map(part => {
          const retained = part.staff.filter(person => person.allocationId !== selected.allocationId);
          return <p key={part.segmentId}>{part.serviceName} · {formatLocalDateTime(part.startsAt, data!.timezone)}
            {retained.length > 0 && <> · {retained.map(person => person.name).join("、")}</>}</p>;
        })}
      </div>
      <label>改派美容師<select ref={targetControl} required value={target} disabled={busy}
        onChange={event => setTarget(event.target.value)}>
        <option value="">請選擇</option>{staff.filter(row => !selected.arrangements
          .find(part => part.segmentId === selected.segmentId)?.staff.some(person => person.staffId === row.id)).map(row =>
          <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>改派原因<textarea required maxLength={500} value={reason} disabled={busy}
        onChange={event => setReason(event.target.value)} /></label>
      <button type="submit" disabled={busy || !target || !reason.trim()}>
        <Shuffle size={18} aria-hidden="true" /> 確認改派</button>
      <button type="button" disabled={busy} onClick={() => setSelected(null)}>取消</button>
    </form>}
    <nav aria-label="待處理清單分頁" style={{ display: "flex", gap: 8 }}>
      <button type="button" aria-label="上一頁" title="上一頁" disabled={busy || loading || offset === 0}
        onClick={() => { setLoading(true); setSelected(null); setOffset(value => Math.max(0, value - 50)); }}><ArrowLeft size={18} /></button>
      <button type="button" aria-label="下一頁" title="下一頁" disabled={busy || loading || !data || offset + 50 >= data.total}
        onClick={() => { setLoading(true); setSelected(null); setOffset(value => value + 50); }}><ArrowRight size={18} /></button>
    </nav>
  </div>;
}

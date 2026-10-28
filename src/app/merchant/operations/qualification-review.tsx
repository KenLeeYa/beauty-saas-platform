"use client";

import {LanguageSwitcher, useLanguage} from "@/components/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Shuffle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { listQualificationReviews } from "@/server/booking/qualification-review";
import { formatLocalDateTime } from "@/lib/presentation/date-time";
import styles from "./review.module.css";

type Review = Awaited<ReturnType<typeof listQualificationReviews>>;

export function QualificationReview({ query, staff }: {
  query: string; staff: Array<{ id: string; name: string }>;
}) {
  const {t, errorText} = useLanguage();
  const [data, setData] = useState<Review | null>(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selected, setSelected] = useState<Review["items"][number] | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const targetControl = useRef<HTMLSelectElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(null);
  const scrollBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const dialog = dialogElement;
    const body = scrollBody.current;
    const viewport = window.visualViewport;
    if (!dialog || !body) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Mobile keyboards can shrink/pan the visual viewport without changing dvh.
        dialog.style.setProperty("--reassignment-height", `${viewport?.height ?? window.innerHeight}px`);
        dialog.style.setProperty("--reassignment-top", `${viewport?.offsetTop ?? 0}px`);
        dialog.style.setProperty("--reassignment-left", `${viewport?.offsetLeft ?? 0}px`);
        dialog.style.setProperty("--reassignment-width", `${viewport?.width ?? window.innerWidth}px`);
        dialog.dataset.keyboard = String(window.innerHeight - (viewport?.height ?? window.innerHeight) > 120);
        // Reveal the focused field after the resized layout has settled.
        frame = requestAnimationFrame(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !body.contains(active)) return;
          const field = active.getBoundingClientRect();
          const visible = body.getBoundingClientRect();
          if (field.bottom > visible.bottom - 8) body.scrollTop += field.bottom - visible.bottom + 8;
          else if (field.top < visible.top + 8) body.scrollTop -= visible.top + 8 - field.top;
        });
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    body.addEventListener("focusin", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      body.removeEventListener("focusin", update);
    };
  }, [selected, error, dialogElement]);
  const load = useCallback(async (signal?: AbortSignal) => {
      const response = await fetch(`/api/merchant/bookings/reassign?${query}&review=qualification&limit=6&offset=${offset}&search=${encodeURIComponent(search)}`,
        { cache: "no-store", signal });
      const result = await response.json() as { data?: Review; error?: { message: string } };
      if (!response.ok || !result.data) throw Error(result.error?.message ?? "無法載入待處理預約");
      return result.data;
  }, [query, offset, search]);
  function receive(result: Review) {
    setData(result); setSelected(null); setError(""); setLoading(false);
  }
  function fail(cause: unknown) {
    setData(null); setSelected(null); setLoading(false);
    setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "無法載入待處理預約，請確認連線後重新整理");
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void load(controller.signal).then(result => {
      if (!controller.signal.aborted) receive(result);
    }, cause => { if (!controller.signal.aborted) fail(cause); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, refreshVersion]);
  function refresh() {
    setLoading(true); setSelected(null);
    setRefreshVersion(value => value + 1);
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
      setMessage("已確認改派"); setTarget(""); setReason(""); setSelected(null);
      setLoading(true);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "連線中斷，請返回清單重新整理並確認改派結果");
    }
    finally { setBusy(false); }
  }

  return <div className={styles.qualificationReview} aria-label={t("資格異動待處理預約")} aria-busy={busy || loading}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <h3 ref={heading} tabIndex={-1}> {t("資格異動待處理")} {data ? ` (${data.total})` : ""}</h3>
      <button type="button" aria-label={t("重新整理待處理預約")} title={t("重新整理待處理預約")}
        disabled={busy || loading} onClick={refresh}><RefreshCw size={18} /></button>
    </header>
    <label className="block my-3">{t("搜尋服務或人員")}
      <input type="search" maxLength={100} disabled={busy} className="block w-full min-w-0" value={search}
        onChange={event => {setSearch(event.target.value); setOffset(0); setLoading(true);}} />
    </label>
    {loading && <p role="status"> {t("載入中")} </p>}
    {error && !selected && <p role="alert">{errorText(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {!loading && data?.total === 0 && <p> {t("目前沒有資格異動待處理預約")} </p>}
    {!loading && data && <ul style={{ padding: 0, listStyle: "none" }}>{data.items.map(item =>
      <li key={item.allocationId ?? `${item.segmentId}:${item.staffId}`} data-segment-id={item.segmentId}
        data-allocation-id={item.allocationId} className={styles.reviewItem}>
        <strong>{item.serviceName}</strong>
        <div>{formatLocalDateTime(item.startsAt, data.timezone)}</div>
        <div>{item.staffName} {t("· 資格未涵蓋預約時間")} </div>
        {item.canReassign ? <button type="button" disabled={busy} onClick={event => {
          opener.current = event.currentTarget;
          setSelected(item); setTarget(""); setReason(""); setError(""); setMessage("");
        }}><Shuffle size={18} aria-hidden="true" /> {t("選擇改派人員")} </button>
          : <p> {t("缺少人員時段配置，請先確認原預約資料")} </p>}
      </li>)}</ul>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent ref={setDialogElement} showCloseButton={false} className={`${styles.workspace} ${styles.qualificationReview} ${styles.reassignmentDialog}`}
        onOpenAutoFocus={event => { event.preventDefault(); targetControl.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : heading.current)?.focus({ preventScroll: true }));
        }}
        onInteractOutside={event => event.preventDefault()}>
        {selected && <form className={styles.reassignmentForm} aria-label={t("確認資格異動改派")}
          aria-busy={busy} onSubmit={event => { event.preventDefault(); void confirm(); }}>
          <header className={styles.reassignmentHeader}>
            <LanguageSwitcher compact />
            <DialogTitle> {t("改派預約")} </DialogTitle>
            <DialogDescription>{selected.serviceName} · {formatLocalDateTime(selected.startsAt, data!.timezone)}</DialogDescription>
          </header>
          <div ref={scrollBody} className={styles.reassignmentBody}>
            {error && <p role="alert" className={styles.reassignmentError}>{errorText(error)}</p>}
            <div className={styles.reassignmentFields}>
              <p> {t("原服務人員：")} {selected.staffName}</p>
              <label> {t("改派美容師")} <select ref={targetControl} required value={target} disabled={busy}
                onChange={event => setTarget(event.target.value)}>
                <option value=""> {t("請選擇")} </option>{staff.filter(row => !selected.arrangements
                  .find(part => part.segmentId === selected.segmentId)?.staff.some(person => person.staffId === row.id)).map(row =>
                  <option key={row.id} value={row.id}>{row.name}</option>)}
              </select></label>
              <label> {t("改派原因")} <textarea rows={2} required maxLength={500} value={reason} disabled={busy}
                onChange={event => setReason(event.target.value)} /></label>
            </div>
            <details open aria-label={t("保留安排")} className={styles.retainedArrangements}>
              <summary> {t("保留安排")} </summary>
              <ul>{selected.arrangements.map(part => {
                const retained = part.staff.filter(person => person.allocationId !== selected.allocationId);
                return <li key={part.segmentId}>
                  <strong>{part.serviceName}</strong>
                  <time dateTime={part.startsAt}>{formatLocalDateTime(part.startsAt, data!.timezone)}</time>
                  <span>{retained.length > 0 ? retained.map(person => person.name).join("、") : t("服務時段不變")}</span>
                </li>;
              })}</ul>
            </details>
          </div>
          <footer className={styles.reassignmentActions}>
            <button type="button" disabled={busy} onClick={() => setSelected(null)}><ArrowLeft size={18} aria-hidden="true" /> {t("取消")} </button>
            <button type="submit" disabled={busy || !target || !reason.trim()}>
              <Shuffle size={18} aria-hidden="true" /> {busy ? t("改派中…") : t("確認改派")}</button>
          </footer>
        </form>}
      </DialogContent>
    </Dialog>
    <nav aria-label={t("待處理清單分頁")} style={{ display: "flex", gap: 8 }}>
      <button type="button" aria-label={t("上一頁")} title={t("上一頁")} disabled={busy || loading || offset === 0}
        onClick={() => { setLoading(true); setSelected(null); setOffset(value => Math.max(0, value - 6)); }}><ArrowLeft size={18} /></button>
      <span aria-live="polite">{data ? `${data.items.length ? offset + 1 : 0} - ${offset + data.items.length} / ${data.total}` : ""}</span>
      <button type="button" aria-label={t("下一頁")} title={t("下一頁")} disabled={busy || loading || !data || offset + 6 >= data.total}
        onClick={() => { setLoading(true); setSelected(null); setOffset(value => value + 6); }}><ArrowRight size={18} /></button>
    </nav>
  </div>;
}

"use client";

import {useLanguage} from "@/components/language-provider";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { requestId } from "@/lib/line-booking/request-id";
import { formatLocalDateTime } from "@/lib/presentation/date-time";

import styles from "./booking.module.css";

type Event = { id: string; kind: "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT";
  occurredAt: string };

const labels: Record<Event["kind"], string> = {
  CLOCK_IN: "上班打卡", BREAK_START: "開始休息", BREAK_END: "結束休息",
  CLOCK_OUT: "下班打卡",
};

export default function AttendancePanel({ store, timezone }: { store: string; timezone: string }) {
  const {t, errorText} = useLanguage();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  async function refresh() {
    const response = await fetch(`/api/line-booking/attendance?store=${encodeURIComponent(store)}`,
      { cache: "no-store" });
    if (!response.ok) throw Error("打卡結果尚未確認，請重新載入紀錄後再操作。");
    setEvents((await response.json() as { events: Event[] }).events);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/line-booking/attendance?store=${encodeURIComponent(store)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw Error("無法載入出勤紀錄");
        const result = await response.json() as { events: Event[] };
        if (active) { setEvents(result.events); setError(""); }
      }).catch(() => { if (active) setError("出勤紀錄暫時無法載入，請重試。"); });
    return () => { active = false; };
  }, [store, attempt]);
  const last = events?.[0]?.kind;
  const actions: Event["kind"][] = !last || last === "CLOCK_OUT" ? ["CLOCK_IN"] :
    last === "BREAK_START" ? ["BREAK_END"] : ["BREAK_START", "CLOCK_OUT"];
  async function clock(kind: Event["kind"]) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/line-booking/attendance", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ store, kind, idempotencyKey: requestId() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw Error(data.error || "打卡失敗");
      await refresh();
    } catch (cause) { setEvents(null); setError(cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message : "打卡失敗，請重新載入紀錄。"); }
    finally { setPending(false); }
  }
  return <section id="attendance" className={styles.panel} aria-label={t("我的出勤")}>
    <div className={styles.heading}><h2> {t("我的出勤")} </h2><button className={styles.secondary}
      type="button" aria-label={t("重新載入出勤紀錄")} title={t("重新載入出勤紀錄")}
      disabled={pending} onClick={() => { setError(""); setEvents(null); setAttempt(value => value + 1); }}><RefreshCw size={20} /></button></div>
    {!events && !error && <p role="status"> {t("正在載入出勤紀錄…")} </p>}
    {events && <div className={styles.actions}>{actions.map(kind =>
      <button key={kind} type="button" className={styles.primary}
        disabled={pending} onClick={() => clock(kind)}>{t(labels[kind])}</button>)}</div>}
    {error && <p role="alert" className={styles.error}>{errorText(error)}</p>}
    {events?.length === 0 && <p className={styles.helper}> {t("目前沒有打卡紀錄。")} </p>}
    <ol aria-label={t("最近打卡紀錄")} className={styles.records}>{events?.slice(0, 10).map(event =>
      <li key={event.id}><strong>{t(labels[event.kind])}</strong><span>{formatLocalDateTime(event.occurredAt, timezone)}</span></li>)}</ol>
  </section>;
}

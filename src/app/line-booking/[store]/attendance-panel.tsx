"use client";

import { useEffect, useState } from "react";
import { requestId } from "@/lib/line-booking/request-id";

import styles from "./booking.module.css";

type Event = { id: string; kind: "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT";
  occurredAt: string };

const labels: Record<Event["kind"], string> = {
  CLOCK_IN: "上班打卡", BREAK_START: "開始休息", BREAK_END: "結束休息",
  CLOCK_OUT: "下班打卡",
};

export default function AttendancePanel({ store }: { store: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function refresh() {
    const response = await fetch(`/api/line-booking/attendance?store=${encodeURIComponent(store)}`,
      { cache: "no-store" });
    if (response.ok) setEvents((await response.json() as { events: Event[] }).events);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/line-booking/attendance?store=${encodeURIComponent(store)}`, { cache: "no-store" })
      .then(async response => {
        if (response.ok && active) setEvents((await response.json() as { events: Event[] }).events);
      }).catch(() => {});
    return () => { active = false; };
  }, [store]);
  if (!events) return null;
  const last = events[0]?.kind;
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "打卡失敗"); }
    finally { setPending(false); }
  }
  return <section id="attendance" className={styles.panel} aria-label="我的出勤">
    <h2>我的出勤</h2>
    <div className={styles.actions}>{actions.map(kind =>
      <button key={kind} type="button" className={styles.primary}
        disabled={pending} onClick={() => clock(kind)}>{labels[kind]}</button>)}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <ol aria-label="最近打卡紀錄">{events.slice(0, 10).map(event =>
      <li key={event.id}>{labels[event.kind]} · {new Date(event.occurredAt)
        .toLocaleString("zh-TW")}</li>)}</ol>
  </section>;
}

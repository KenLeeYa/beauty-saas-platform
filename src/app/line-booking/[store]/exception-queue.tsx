"use client";

import { useEffect, useState } from "react";
import styles from "./booking.module.css";

type Item = { id:string; kind:"FAILED_DISPATCH"|"PENDING_PAYMENT";
  startsAt:string; serviceName:string; staffName:string; bookingId:string|null };

export default function ExceptionQueue({ store }: { store:string }) {
  const [items,setItems] = useState<Item[] | null>(null);
  const [error,setError] = useState("");
  const load = async () => {
    const response = await fetch(`/api/line-booking/exceptions?store=${encodeURIComponent(store)}`,
      { cache:"no-store" });
    if (response.status === 403) { setItems(null); return; }
    if (!response.ok) { setError("待處理事項暫時無法載入"); return; }
    const data = await response.json() as { items:Item[] };
    setItems(data.items);
  };
  useEffect(() => {
    let active=true;
    fetch(`/api/line-booking/exceptions?store=${encodeURIComponent(store)}`,
      { cache:"no-store" }).then(async response => {
      if (!active || response.status === 403) return;
      if (!response.ok) { setError("待處理事項暫時無法載入"); return; }
      const data=await response.json() as { items:Item[] };
      if (active) setItems(data.items);
    }).catch(() => { if (active) setError("待處理事項暫時無法載入"); });
    return () => { active=false; };
  },[store]);
  async function review(claimId:string) {
    const reason = prompt("處理結果與原因");
    if (!reason?.trim()) return;
    const response = await fetch("/api/line-booking/exceptions",{
      method:"POST",headers:{ "content-type":"application/json" },
      body:JSON.stringify({ store,claimId,reason }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?:string };
      setError(result.error ?? "處理失敗"); return;
    }
    setError(""); await load();
  }
  if (!items) return null;
  return <section id="exceptions" className={styles.panel} aria-label="櫃台待處理事項">
    <h2>櫃台待處理事項</h2>
    {error && <p role="alert">{error}</p>}
    {items.length === 0 ? <p>目前沒有待處理事項。</p> : <ul>
      {items.map(item => <li key={`${item.kind}:${item.id}`}>
        <strong>{item.kind === "FAILED_DISPATCH" ? "派單失敗" : "待確認付款"}</strong>
        <span> {new Date(item.startsAt).toLocaleString("zh-TW")} · {item.serviceName}
          {item.staffName ? ` · ${item.staffName}` : ""}</span>
        {item.kind === "FAILED_DISPATCH" &&
          <button type="button" onClick={() => void review(item.id)}>記錄處理結果</button>}
        {item.bookingId && <span> · 訂單 {item.bookingId}</span>}
      </li>)}
    </ul>}
  </section>;
}

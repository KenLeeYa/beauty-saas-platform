"use client";

import {useLanguage} from "@/components/language-provider";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatLocalDateTime } from "@/lib/presentation/date-time";
import styles from "./booking.module.css";

type Item = { id:string; kind:"FAILED_DISPATCH"|"PENDING_PAYMENT";
  startsAt:string; serviceName:string; staffName:string; bookingId:string|null };

export default function ExceptionQueue({ store, timezone }: { store:string; timezone:string }) {
  const {t, errorText} = useLanguage();
  const [items,setItems] = useState<Item[] | null>(null);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  const [loading,setLoading] = useState(true);
  const [forbidden,setForbidden] = useState(false);
  const [busy,setBusy] = useState(false);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [notice,setNotice] = useState("");
  useEffect(() => {
    let active=true;
    fetch(`/api/line-booking/exceptions?store=${encodeURIComponent(store)}`,
      { cache:"no-store" }).then(async response => {
      if (!active) return;
      if (response.status === 403) { setForbidden(true); return; }
      if (!response.ok) { setError("待處理事項暫時無法載入"); return; }
      const data=await response.json() as { items:Item[] };
      if (active) setItems(data.items);
    }).catch(() => { if (active) setError("待處理事項暫時無法載入"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active=false; };
  },[store,attempt]);
  function reload() { setLoading(true); setError(""); setAttempt(value => value + 1); }
  async function review(claimId:string) {
    const reason = drafts[claimId]?.trim();
    if (!reason || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
    const response = await fetch("/api/line-booking/exceptions",{
      method:"POST",headers:{ "content-type":"application/json" },
      body:JSON.stringify({ store,claimId,reason }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?:string };
      setError(result.error ?? "處理失敗"); return;
    }
    setItems(current => current?.filter(item => item.id !== claimId) ?? []);
    setNotice("處理結果已記錄。");
    reload();
    } catch { setError("連線失敗，處理原因已保留，請重試。"); }
    finally { setBusy(false); }
  }
  if (forbidden) return null;
  return <section id="exceptions" className={styles.panel} aria-label={t("櫃台待處理事項")}>
    <div className={styles.heading}><h2> {t("櫃台待處理事項")} </h2>
      <button className={styles.secondary} type="button" aria-label={t("重新載入待處理事項")} title={t("重新載入待處理事項")} disabled={loading || busy} onClick={reload}><RefreshCw size={20} /></button></div>
    {error && <p role="alert">{errorText(error)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {loading && <p role="status"> {t("正在載入待處理事項…")} </p>}
    {items?.length === 0 ? <p> {t("目前沒有待處理事項。")} </p> : <ul className={styles.records}>
      {items?.map(item => <li key={`${item.kind}:${item.id}`}>
        <strong>{item.kind === "FAILED_DISPATCH" ? t("派單失敗") : t("待確認付款")}</strong>
        <span> {formatLocalDateTime(item.startsAt, timezone)} · {item.serviceName}
          {item.staffName ? ` · ${item.staffName}` : ""}</span>
        {item.kind === "FAILED_DISPATCH" && <details><summary> {t("記錄處理結果")} </summary>
          <form className={styles.fields} onSubmit={event => { event.preventDefault(); void review(item.id); }}>
            <label> {t("處理結果與原因")} <textarea required maxLength={500} disabled={busy} value={drafts[item.id] ?? ""}
              onChange={event => setDrafts(current => ({...current,[item.id]:event.target.value}))} /></label>
            <button className={styles.primary} type="submit" disabled={busy || !drafts[item.id]?.trim()}>{busy ? t("儲存中…") : t("儲存處理結果")}</button>
          </form></details>}
        {item.bookingId && <details><summary> {t("預約明細")} </summary><p> {t("預約編號：")} {item.bookingId}</p></details>}
      </li>)}
    </ul>}
  </section>;
}

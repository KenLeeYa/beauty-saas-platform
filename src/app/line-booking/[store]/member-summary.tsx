"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { RefreshCw } from "lucide-react";
import { MemberBenefits, walletSchema, benefitSchema } from "@/components/member-benefits";

import styles from "./booking.module.css";
import {useLanguage} from "@/components/language-provider";

const summarySchema = z.object({ visible: z.boolean(), newIssuanceEnabled: z.boolean(),
  balance: walletSchema, issues: z.array(benefitSchema) });

export default function MemberSummary({ store, timezone }: { store: string; timezone: string }) {
  const {t, errorText} = useLanguage();
  const [data, setData] = useState<z.infer<typeof summarySchema> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/line-booking/member?store=${encodeURIComponent(store)}`,
      { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error("會員權益暫時無法載入，請稍後再試。");
      const result = summarySchema.parse(await response.json());
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("會員權益暫時無法載入，請稍後再試。"); });
    return () => controller.abort();
  }, [store, attempt]);
  return <section id="member" className={styles.panel} aria-label={t('我的會員權益')}>
    <div className={styles.heading}><h2>{t('我的會員權益')}</h2>
      <button type="button" className={styles.secondary} aria-label={t('重新載入會員權益')} title={t('重新載入會員權益')}
        onClick={() => { setError(""); setData(null); setAttempt(value => value + 1); }}><RefreshCw size={18} /></button></div>
    {error ? <p role="alert" className={styles.error}>{errorText(error)}</p> : !data ? <p role="status">{t('正在載入會員權益…')}</p> : <>
      <MemberBenefits wallet={data.balance} benefits={data.issues} timezone={timezone} />
      {!data.newIssuanceEnabled && <p className={styles.helper}>{t('目前未開放新權益；既有餘額與權益不受影響。')}</p>}
    </>}
  </section>;
}

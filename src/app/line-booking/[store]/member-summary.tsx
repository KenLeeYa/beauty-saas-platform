"use client";

import { useEffect, useState } from "react";

import styles from "./booking.module.css";

type MemberSummaryData = { visible: boolean; newIssuanceEnabled: boolean;
  balance: { paidMinor: number; bonusMinor: number; totalMinor: number };
  issues: Array<{ id: string; kind: string; available: number;
    expiresAt: string | null }> };

function money(amountMinor: number): string {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD" })
    .format(amountMinor / 100);
}

export default function MemberSummary({ store }: { store: string }) {
  const [data, setData] = useState<MemberSummaryData | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/line-booking/member?store=${encodeURIComponent(store)}`,
      { cache: "no-store" }).then(async response => {
      if (response.ok && active) setData(await response.json() as MemberSummaryData);
    }).catch(() => {});
    return () => { active = false; };
  }, [store]);
  if (!data?.visible) return null;
  return <section id="member" className={styles.panel} aria-label="我的會員權益">
    <h2>我的會員權益</h2>
    <dl aria-label="會員餘額">
      <dt>儲值本金</dt><dd>{money(data.balance.paidMinor)}</dd>
      <dt>贈送餘額</dt><dd>{money(data.balance.bonusMinor)}</dd>
      <dt>合計</dt><dd>{money(data.balance.totalMinor)}</dd>
    </dl>
    {data.issues.length > 0 && <ul aria-label="已取得權益">
      {data.issues.map(issue => <li key={issue.id}>{issue.kind} × {issue.available}
        {issue.expiresAt ? ` · 到期 ${new Date(issue.expiresAt).toLocaleDateString("zh-TW")}` : ""}</li>)}
    </ul>}
    {!data.newIssuanceEnabled && <p className={styles.helper}>既有餘額與權益仍可查詢；目前不發行新權益。</p>}
  </section>;
}

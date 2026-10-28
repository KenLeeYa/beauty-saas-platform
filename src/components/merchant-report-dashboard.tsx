"use client";

import type {MerchantWorkspaceData} from "@/server/merchant/data";
import {useLanguage} from "./language-provider";
import {useMerchantPagination} from "./merchant-sheet";

export function MerchantReportDashboard({data}: {data: {
  bookings: Array<Pick<MerchantWorkspaceData["bookings"][number], "status" | "serviceName" | "totalMinor">>;
  stats: {currency: string};
}}) {
  const {t, locale} = useLanguage();
  const money = (value: number) => new Intl.NumberFormat(locale, {
    style: "currency", currency: data.stats.currency, maximumFractionDigits: 0,
  }).format(value / 100);
  const completed = data.bookings.filter(booking => booking.status === "COMPLETED");
  const services = new Map<string, number>();
  for (const booking of completed) services.set(booking.serviceName, (services.get(booking.serviceName) ?? 0) + booking.totalMinor);
  const revenue = [...services.entries()].sort((a, b) => b[1] - a[1]);
  const revenuePage = useMerchantPagination(revenue);
  const maxRevenue = Math.max(1, ...revenue.map(([, amount]) => amount));
  const statuses = [
    ["PENDING_PAYMENT","待訂金"], ["CONFIRMED","已確認"], ["CHECKED_IN","已報到"],
    ["IN_SERVICE","服務中"], ["COMPLETED","已完成"], ["CANCELLED","已取消"],
    ["NO_SHOW","未到店"], ["EXPIRED","已失效"], ["RESCHEDULED","已改期"],
  ] as const;
  return <div className="merchant-report-dashboard">
    <dl className="merchant-report-kpis">
      <div><dt>{t("預約總數")}</dt><dd>{data.bookings.length}</dd></div>
      <div><dt>{t("完成服務")}</dt><dd>{completed.length}</dd></div>
      <div><dt>{t("取消預約")}</dt><dd>{data.bookings.filter(booking => booking.status === "CANCELLED").length}</dd></div>
      <div><dt>{t("完成服務合計")}</dt><dd>{money(completed.reduce((sum, booking) => sum + booking.totalMinor, 0))}</dd></div>
    </dl>
    <p className="text-xs text-slate-500">{t("目前載入範圍")} · {data.bookings.length} {t("筆預約")}</p>
    <div className="merchant-report-sections">
      <section aria-label={t("服務營收")}>
        <h2>{t("服務營收")}</h2>
        <div className="merchant-report-list">
          {revenuePage.items.map(([name, amount]) => <div key={name} className="merchant-report-row">
            <div><span>{name}</span><strong>{money(amount)}</strong></div>
            <div className="merchant-report-track" aria-hidden="true"><span style={{width: `${amount / maxRevenue * 100}%`}}/></div>
          </div>)}
          {!revenue.length && <p className="py-4 text-sm text-slate-500">{t("尚無已完成服務可供彙總。")}</p>}
        </div>
        {revenuePage.pager}
      </section>
      <section aria-label={t("預約狀態")}>
        <h2>{t("預約狀態")}</h2>
        <dl className="merchant-report-statuses">
          {statuses.map(([status,label]) => <div key={status}>
            <dt><span className={`merchant-status-dot merchant-status-${status.toLowerCase()}`} aria-hidden="true"/>{t(label)}</dt>
            <dd>{data.bookings.filter(booking => booking.status === status).length}</dd>
          </div>)}
        </dl>
      </section>
    </div>
  </div>;
}

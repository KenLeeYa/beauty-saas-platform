"use client";

import { useState } from "react";
import { z } from "zod";
import { formatLocalDateTime } from "@/lib/presentation/date-time";
import {useLanguage} from "./language-provider";

export const walletSchema = z.object({ paidMinor: z.number().int(), bonusMinor: z.number().int(), totalMinor: z.number().int() });
export const benefitSchema = z.object({ id: z.string(), kind: z.enum(["COUPON", "SERVICE_PACKAGE"]),
  available: z.number().int(), expiresAt: z.iso.datetime().nullable(),
  terms: z.object({ quantity: z.number().int(), discountMinor: z.number().int().optional(), serviceVariantId: z.string().optional() }) });
const money = (value: number, currency = "TWD") => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(value / 100);

export function MemberBenefits({ wallet, benefits, timezone }: {
  wallet: z.infer<typeof walletSchema>; benefits: z.infer<typeof benefitSchema>[]; timezone: string;
}) {
  const {locale, t} = useLanguage();
  const memberMoney = (value: number) => new Intl.NumberFormat(locale, {
    style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(value / 100);
  const [loadedAt] = useState(() => Date.now());
  return <div className="member-benefits">
    <dl aria-label={t('會員餘額')} className="member-balance">
      <div className="member-total"><dt>{t('可用餘額')}</dt><dd>{memberMoney(wallet.totalMinor)}</dd></div>
      <div><dt>{t('儲值本金')}</dt><dd>{memberMoney(wallet.paidMinor)}</dd></div>
      <div><dt>{t('贈送餘額')}</dt><dd>{memberMoney(wallet.bonusMinor)}</dd></div>
    </dl>
    <h3>{t('已取得權益')}</h3>
    {benefits.length === 0 ? <p>{t('目前沒有優惠券或服務套票。')}</p> :
      <ul aria-label={t('已取得權益')} className="member-issues">{benefits.map(issue => {
        const expired = issue.expiresAt !== null && new Date(issue.expiresAt).getTime() <= loadedAt;
        return <li key={issue.id}>
          <div className="member-issue-heading"><strong>{issue.kind === "COUPON" ? t("優惠券") : t("服務套票")}</strong>
            <span>{expired ? t("已到期") : issue.available > 0 ? `${t('剩餘')} ${issue.available} ${t('次')}` : t("無可用次數")}</span></div>
          {issue.terms.discountMinor !== undefined && <p>{t('每次折抵')} {memberMoney(issue.terms.discountMinor)}</p>}
          <p>{issue.expiresAt ? `${t('到期時間')} ${formatLocalDateTime(issue.expiresAt, timezone)}` : t("無到期日")}</p>
          <details><summary>{t('權益明細')}</summary><dl><dt>{t('發放編號')}</dt><dd>{issue.id}</dd>
            <dt>{t('原始次數')}</dt><dd>{issue.terms.quantity} {t('次')}</dd>
            {issue.terms.serviceVariantId && <><dt>{t('適用服務規格編號')}</dt><dd>{issue.terms.serviceVariantId}</dd></>}
          </dl></details>
        </li>;
      })}</ul>}
  </div>;
}

const balances = z.object({ wallet: walletSchema, benefits: z.array(benefitSchema) });
const promotion = z.object({ listPriceMinor: z.number(), discountMinor: z.number(), payableMinor: z.number(), currency: z.string(), bookingVersion: z.number().optional() });
const commissionLine = z.object({ segmentId: z.string(), staffProfileId: z.string(), basisMinor: z.number(), commissionMinor: z.number(), ruleVersion: z.number() });
const commission = z.object({ quote: z.array(commissionLine), refundQuote: z.array(commissionLine) });
const confirmation = z.union([z.object({ issueId: z.string() }), z.object({ policyId: z.string() }),
  z.object({ ruleId: z.string() }), z.object({ available: z.number() }), z.object({ published: z.literal(true) })]);

export function BenefitResult({ value, timezone }: { value: unknown; timezone: string }) {
  const {t} = useLanguage();
  const balance = balances.safeParse(value);
  if (balance.success) return <section aria-label={t("權益處理結果")}><h3> {t("餘額與權益")} </h3>
    <MemberBenefits {...balance.data} timezone={timezone} /></section>;
  const quote = promotion.safeParse(value);
  if (quote.success) return <section aria-label={t("權益處理結果")}><h3> {t("優惠結帳明細")} </h3><dl className="member-balance">
    <div><dt> {t("原價")} </dt><dd>{money(quote.data.listPriceMinor, quote.data.currency)}</dd></div>
    <div><dt> {t("優惠折抵")} </dt><dd>{money(quote.data.discountMinor, quote.data.currency)}</dd></div>
    <div className="member-total"><dt> {t("應付金額")} </dt><dd>{money(quote.data.payableMinor, quote.data.currency)}</dd></div>
  </dl><p> {t("優惠不可重複併用")} </p>{quote.data.bookingVersion !== undefined && <p> {t("預約版本：第")} {quote.data.bookingVersion} {t("版")} </p>}</section>;
  const commissions = commission.safeParse(value);
  if (commissions.success) return <section aria-label={t("權益處理結果")}><h3> {t("抽成試算")} </h3>
    {[{ title: "服務抽成", lines: commissions.data.quote }, { title: "退款抽成調整", lines: commissions.data.refundQuote }].map(group =>
      <div key={group.title}><h4>{t(group.title)}</h4>{group.lines.length === 0 ? <p> {t("目前沒有適用紀錄。")} </p> :
        <ul className="member-issues">{group.lines.map((line, index) => <li key={`${line.segmentId}:${line.staffProfileId}`}>
          <strong> {t("服務人員")} {index + 1} · {money(line.commissionMinor)}</strong><p> {t("計算基準")} {money(line.basisMinor)} {t("· 規則第")} {line.ruleVersion} {t("版")} </p>
          <details><summary> {t("核對編號")} </summary><p> {t("服務項目：")} {line.segmentId}</p><p> {t("員工：")} {line.staffProfileId}</p></details>
        </li>)}</ul>}</div>)}
  </section>;
  const result = confirmation.safeParse(value);
  if (result.success) return <section aria-label={t("權益處理結果")}><h3> {t("處理結果")} </h3>
    {"available" in result.data ? <p>{t("剩餘權益：")}{result.data.available} {t("次")}</p> :
      "published" in result.data ? <p> {t("規則已發布。")} </p> :
        <dl><dt>{"issueId" in result.data ? t("權益發放編號") : "policyId" in result.data ? t("優惠草稿編號") : t("抽成草稿編號")}</dt>
          <dd>{"issueId" in result.data ? result.data.issueId : "policyId" in result.data ? result.data.policyId : result.data.ruleId}</dd></dl>}
  </section>;
  return <p role="alert"> {t("無法顯示權益結果，請重新查詢。")} </p>;
}

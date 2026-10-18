import { ArrowLeft, ExternalLink, Settings2 } from "lucide-react";
import Link from "next/link";

import { LogoutButton } from "./logout-button";
import { PlatformNavigation } from "./platform-navigation";
import type { PlatformOrganizationDetailData } from "@/server/admin/data";

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function PlatformOrganizationDetail({
  data,
  displayName,
}: {
  data: PlatformOrganizationDetailData;
  displayName: string;
}) {
  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-teal">商家明細</p>
            <h1 className="mt-1 truncate text-xl font-semibold text-ink">
              {data.organization.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-ink sm:block">
              {displayName}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <PlatformNavigation />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700"
            href="/admin/organizations"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            返回商家
          </Link>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white"
            href={`/admin/organizations/${data.organization.id}/features`}
          >
            <Settings2 aria-hidden="true" className="h-4 w-4" />
            功能權益
          </Link>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="border-y border-slate-200 bg-white px-4 py-5">
            <h2 className="font-semibold text-ink">商家資料</h2>
            <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-y-3 text-sm">
              <dt className="text-slate-500">統一名稱</dt>
              <dd className="text-ink">{data.organization.businessName}</dd>
              <dt className="text-slate-500">Slug</dt>
              <dd className="text-ink">{data.organization.slug}</dd>
              <dt className="text-slate-500">狀態</dt>
              <dd className="text-ink">{data.organization.status}</dd>
              <dt className="text-slate-500">聯絡 Email</dt>
              <dd className="break-all text-ink">
                {data.organization.email}
              </dd>
              <dt className="text-slate-500">電話</dt>
              <dd className="text-ink">{data.organization.phone}</dd>
              <dt className="text-slate-500">公開頁面</dt>
              <dd className="text-ink">
                {data.organization.publicProfileEnabled
                  ? "已啟用"
                  : "未啟用"}
              </dd>
            </dl>
          </div>

          <div className="border-y border-slate-200 bg-white px-4 py-5">
            <h2 className="font-semibold text-ink">目前訂閱</h2>
            {data.subscription ? (
              <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-y-3 text-sm">
                <dt className="text-slate-500">方案</dt>
                <dd className="text-ink">
                  {data.subscription.planName} v
                  {data.subscription.planVersion}
                </dd>
                <dt className="text-slate-500">狀態</dt>
                <dd className="text-ink">{data.subscription.status}</dd>
                <dt className="text-slate-500">本期結束</dt>
                <dd className="text-ink">
                  {new Date(
                    data.subscription.currentPeriodEnd,
                  ).toLocaleDateString("zh-TW")}
                </dd>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-500">尚無目前訂閱。</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-ink">分店</h2>
          <div className="mt-3 overflow-x-auto border-y border-slate-200 bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">名稱</th>
                  <th className="px-4 py-3 font-semibold">預約狀態</th>
                  <th className="px-4 py-3 font-semibold">時區</th>
                  <th className="px-4 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.locations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{location.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {location.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {location.bookingState} ·{" "}
                      {location.onlineBookingEnabled ? "線上" : "關閉"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {location.timezone}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="inline-flex items-center gap-1 font-semibold text-teal hover:underline"
                        href={`/merchant/dashboard?organization=${encodeURIComponent(
                          data.organization.slug,
                        )}&location=${encodeURIComponent(location.slug)}`}
                      >
                        工作區
                        <ExternalLink
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                        />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-ink">組織成員</h2>
            <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {data.members.map((member) => (
                <div className="px-4 py-3 text-sm" key={member.id}>
                  <p className="font-semibold text-ink">
                    {member.displayName}
                    {member.isPrimaryOwner ? " · 主要 Owner" : ""}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {member.email} · {member.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">最近發票</h2>
            <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {data.invoices.map((invoice) => (
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  key={invoice.id}
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {invoice.number}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {invoice.status} · 到期{" "}
                      {invoice.dueAt
                        ? new Date(invoice.dueAt).toLocaleDateString(
                            "zh-TW",
                          )
                        : "未設定"}
                    </p>
                  </div>
                  <p className="font-semibold text-ink">
                    {money(invoice.totalMinor, invoice.currency)}
                  </p>
                </div>
              ))}
              {data.invoices.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  尚無發票。
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

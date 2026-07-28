import { Building2, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { LogoutButton } from "./logout-button";
import type { PlatformOverviewData } from "@/server/admin/data";

const statusLabels: Readonly<Record<string, string>> = {
  TRIALING: "試用中",
  ACTIVE: "使用中",
  PAST_DUE: "款項逾期",
  GRACE_PERIOD: "寬限期",
  SUSPENDED: "已暫停",
  CANCELLED: "已取消",
};

export function PlatformOverview({
  data,
}: {
  data: PlatformOverviewData;
}) {
  const stats = [
    {
      label: "商家總數",
      value: data.stats.organizations,
      icon: Building2,
    },
    {
      label: "營運中商家",
      value: data.stats.activeOrganizations,
      icon: ShieldCheck,
    },
    {
      label: "啟用分店",
      value: data.stats.locations,
      icon: MapPin,
    },
    {
      label: "累計預約",
      value: data.stats.bookings,
      icon: CalendarDays,
    },
  ];

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">平台管理</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              Beauty SaaS 營運總覽
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink">
                {data.session.displayName}
              </p>
              <p className="text-xs text-slate-500">
                {data.session.email}
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section
          aria-label="平台統計"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-md border border-slate-200 bg-white p-4"
            >
              <stat.icon
                aria-hidden="true"
                className="h-5 w-5 text-teal"
              />
              <p className="mt-4 text-2xl font-semibold text-ink">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {stat.label}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">商家清單</h2>
              <p className="mt-1 text-sm text-slate-500">
                最近建立的 100 家商家
              </p>
            </div>
          </div>
          <div className="overflow-x-auto border-y border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">商家</th>
                  <th className="px-4 py-3 font-semibold">狀態</th>
                  <th className="px-4 py-3 font-semibold">方案</th>
                  <th className="px-4 py-3 font-semibold">分店</th>
                  <th className="px-4 py-3 font-semibold">成員</th>
                  <th className="px-4 py-3 font-semibold">預約</th>
                  <th className="px-4 py-3 font-semibold">入口</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {organization.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {organization.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {statusLabels[organization.status] ??
                        organization.status}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {organization.planName ?? "尚未設定"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {organization.locationCount}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {organization.memberCount}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {organization.bookingCount}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-teal hover:underline"
                        href={`/merchant/dashboard?organization=${encodeURIComponent(
                          organization.slug,
                        )}`}
                      >
                        開啟後台
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.organizations.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                目前尚未建立商家。
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

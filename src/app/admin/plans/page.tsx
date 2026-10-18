import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { PlatformNavigation } from "@/components/platform-navigation";
import { getAdminPlansData } from "@/server/admin/billing";
import { getCurrentSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export default async function AdminPlansPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    redirect("/merchant");
  }
  const data = await getAdminPlansData(session);

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">平台管理</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              方案版本
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>
      <PlatformNavigation />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="overflow-x-auto border-y border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">方案</th>
                <th className="px-4 py-3 font-semibold">版本</th>
                <th className="px-4 py-3 font-semibold">月費</th>
                <th className="px-4 py-3 font-semibold">試用天數</th>
                <th className="px-4 py-3 font-semibold">啟用功能</th>
                <th className="px-4 py-3 font-semibold">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.plans.flatMap((plan) =>
                plan.versions.map((version) => (
                  <tr key={version.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{plan.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {plan.code}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      v{version.version}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMoney(
                        version.monthlyPriceMinor,
                        version.currency,
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {version.trialDays}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {version.enabledFeatures} / {version.totalFeatures}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {plan.active ? "使用中" : "已停用"}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

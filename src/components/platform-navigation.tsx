"use client";

import { Building2, ClipboardList, CreditCard, Package } from "lucide-react";
import {useLanguage} from "./language-provider";
import Link from "next/link";
import {usePathname} from "next/navigation";

const links = [
  {
    href: "/admin/organizations",
    label: "商家",
    icon: Building2,
  },
  {
    href: "/admin/merchant-applications",
    label: "申請審核",
    icon: ClipboardList,
  },
  {
    href: "/admin/billing",
    label: "帳務",
    icon: CreditCard,
  },
  {
    href: "/admin/plans",
    label: "方案",
    icon: Package,
  },
] as const;

export function PlatformNavigation() {
  const {t} = useLanguage();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('平台管理導覽')}
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-1 px-2 sm:px-6">
        {links.map((link) => (
          <Link
            className="inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 border-b-2 border-transparent px-1 text-center text-xs font-semibold text-slate-600 hover:border-teal hover:text-ink aria-[current=page]:border-teal aria-[current=page]:text-teal"
            aria-label={t(link.label)} title={t(link.label)}
            aria-current={pathname.startsWith(link.href) ? "page" : undefined}
            href={link.href}
            key={link.href}
          >
            <link.icon aria-hidden="true" className="h-4 w-4" />
            <span className="max-w-full truncate">{t(link.label)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

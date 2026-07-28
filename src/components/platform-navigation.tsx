import { Building2, ClipboardList, CreditCard, Package } from "lucide-react";
import Link from "next/link";

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
  return (
    <nav
      aria-label="平台管理導覽"
      className="overflow-x-auto border-b border-slate-200 bg-white"
    >
      <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6">
        {links.map((link) => (
          <Link
            className="inline-flex h-12 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-semibold text-slate-600 hover:border-teal hover:text-ink"
            href={link.href}
            key={link.href}
          >
            <link.icon aria-hidden="true" className="h-4 w-4" />
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

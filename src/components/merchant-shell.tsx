"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import Link from "next/link";
import {BarChart3, BookOpen, BriefcaseBusiness, Building2, CalendarDays, Clock3, CreditCard,
  LayoutDashboard, MoreHorizontal, PackagePlus, ReceiptText, Settings, Users, UserRound, Wrench, X} from "lucide-react";
import {Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger} from "./ui/dialog";
import {WorkspaceHeader} from "./workspace-header";
import {useLanguage} from "./language-provider";

const destinations = [
  {view: "dashboard", label: "營運總覽", short: "總覽", icon: LayoutDashboard, group: "日常營運", primary: true},
  {view: "calendar", label: "預約行事曆", short: "行事曆", icon: CalendarDays, group: "日常營運", primary: true},
  {view: "bookings", label: "預約管理", short: "預約", icon: BookOpen, group: "日常營運", primary: true},
  {view: "customers", label: "顧客管理", short: "顧客", icon: Users, group: "日常營運", primary: true},
  {view: "operations", label: "營運管理", short: "營運工具", icon: Clock3, group: "日常營運"},
  {view: "services", label: "服務項目", icon: BriefcaseBusiness, group: "服務與團隊"},
  {view: "staff", label: "服務人員", icon: UserRound, group: "服務與團隊"},
  {view: "resources", label: "空間與設備", icon: Wrench, group: "服務與團隊"},
  {view: "locations", label: "分店管理", icon: Building2, group: "服務與團隊"},
  {view: "team", label: "團隊與權限", icon: Users, group: "服務與團隊"},
  {view: "reports", label: "營運報表", icon: BarChart3, group: "商家管理"},
  {view: "subscription", label: "訂閱方案", icon: CreditCard, group: "商家管理"},
  {view: "billing", label: "帳務管理", icon: ReceiptText, group: "商家管理"},
  {view: "settings", label: "商家設定", icon: Settings, group: "商家管理"},
  {view: "setup", label: "開店設定", icon: PackagePlus, group: "商家管理"},
];
const groups = ["日常營運", "服務與團隊", "商家管理"];

function useNavigationScroll(key: string, visible = true) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!visible || !element) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(key); } catch { /* Storage can be disabled. */ }
    const frame = requestAnimationFrame(() => {
      if (saved !== null && Number.isFinite(Number(saved))) element.scrollTop = Number(saved);
      else {
        const active = element.querySelector<HTMLElement>('a[aria-current="page"]');
        if (active) {
          const box = active.getBoundingClientRect(), viewport = element.getBoundingClientRect();
          if (box.bottom > viewport.bottom) element.scrollTop += box.bottom - viewport.bottom + 12;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [key, visible, element]);
  return {ref: setElement, onScroll: () => {
    if (!element?.clientHeight) return;
    try { sessionStorage.setItem(key, String(element.scrollTop)); } catch { /* Navigation still works without storage. */ }
  }};
}

export function MerchantShell({organization, organizationName, location, locationName, identity, activeView,
  crmVisible, operationsVisible, teamVisible, disabled = false, children}: {
  organization: string; organizationName: string; location: string; locationName: string;
  identity: string; activeView: string; crmVisible: boolean; operationsVisible: boolean;
  teamVisible: boolean; disabled?: boolean; children: ReactNode;
}) {
  const {t} = useLanguage();
  const [open, setOpen] = useState(false);
  const scope = new URLSearchParams({organization, location}).toString();
  const sidebarScroll = useNavigationScroll(`beauty:nav:${scope}:desktop`);
  const menuScroll = useNavigationScroll(`beauty:nav:${scope}:mobile`, open);
  const menuTitle = useRef<HTMLHeadingElement>(null);
  const items = destinations.filter(item => (crmVisible || item.view !== "customers") &&
    (operationsVisible || item.view !== "operations") && (teamVisible || item.view !== "team"));
  const primary = items.filter(item => item.primary);
  const moreActive = !primary.some(item => item.view === activeView);
  const navigation = (label: string) => <nav aria-label={t(label)} className="workspace-directory">
    {groups.map(group => <section key={group}>
      <h2>{t(group)}</h2>
      {items.filter(item => item.group === group).map(item => <Link key={item.view}
        href={`/merchant/${item.view}?${scope}`} aria-current={activeView === item.view ? "page" : undefined}
        aria-disabled={disabled || undefined} onClick={event => {if (disabled) event.preventDefault(); else setOpen(false);}}>
        <item.icon size={19} aria-hidden="true"/><span>{t(item.label)}</span>
      </Link>)}
    </section>)}
    <Link href={`/select-location?organization=${encodeURIComponent(organization)}`}
      aria-disabled={disabled || undefined} onClick={event => {if (disabled) event.preventDefault(); else setOpen(false);}}>
      <Building2 size={19} aria-hidden="true"/><span>{t("切換分店")}</span>
    </Link>
  </nav>;
  return <div className="merchant-workspace workspace-shell">
    <aside className="workspace-sidebar" {...sidebarScroll}>
      <Link className="workspace-brand" href={`/merchant/dashboard?${scope}`}>
        <span aria-hidden="true">L</span><div><strong>Lumi</strong><p>{organizationName}</p></div>
      </Link>
      {navigation("店家後台")}
    </aside>
    <div className="workspace-content">
      <WorkspaceHeader title={locationName} subtitle={`${organizationName} · ${identity}`}
        bookingPath={`/book/${organization}/${location}`} disabled={disabled}/>
      {children}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <nav aria-label={t("主要導覽")} className="workspace-tabbar" style={{gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))`}}>
        {primary.map(item => <Link key={item.view} href={`/merchant/${item.view}?${scope}`} title={t(item.label)} aria-label={t(item.label)}
          aria-current={activeView === item.view ? "page" : undefined} aria-disabled={disabled || undefined}
          onClick={event => {if (disabled) event.preventDefault();}}>
          <item.icon size={21} aria-hidden="true"/><span>{t(item.short!)}</span>
        </Link>)}
        <DialogTrigger asChild><button type="button" aria-label={t("開啟選單")} title={t("全部功能")} disabled={disabled}
          aria-current={moreActive ? "page" : undefined}><MoreHorizontal size={21} aria-hidden="true"/><span>{t("更多")}</span></button></DialogTrigger>
      </nav>
      <DialogContent className="workspace-menu !max-w-xl !rounded-lg" showCloseButton={false} aria-describedby={undefined}
        onOpenAutoFocus={event=>{event.preventDefault();menuTitle.current?.focus({preventScroll:true});}}>
        <div className="workspace-menu-heading"><DialogTitle ref={menuTitle} tabIndex={-1}>{t("全部功能")}</DialogTitle>
          <DialogClose asChild><button type="button" className="utility-icon" aria-label={t("關閉選單")} title={t("關閉選單")}><X size={20} aria-hidden="true"/></button></DialogClose>
        </div>
        <div className="workspace-menu-body" {...menuScroll}>{navigation("全部功能")}</div>
      </DialogContent>
    </Dialog>
  </div>;
}

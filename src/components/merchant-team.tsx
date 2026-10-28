"use client";
import {useState} from "react";
import {ChevronRight, ShieldCheck} from "lucide-react";
import type {MerchantTeamData} from "@/server/merchant/team";
import {useLanguage} from "./language-provider";
import {MerchantPager, MerchantSheet} from "./merchant-sheet";

const statusLabels:Record<string,string>={ACTIVE:"使用中",INVITED:"待接受邀請",DISABLED:"已停用",REMOVED:"已移除",INACTIVE:"已停用"};

export function MerchantTeam({members,locationName}:{members:MerchantTeamData;locationName:string}) {
  const {t}=useLanguage();
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const matches=members.filter(row=>`${row.name} ${t(row.role)}`.toLowerCase().includes(search.toLowerCase()));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(matches.length/6)-1));
  const selected=members.find(row=>row.id===selectedId);
  return <section aria-label={t("授權成員")}>
    <div className="merchant-toolbar merchant-team-search"><input type="search" aria-label={t("搜尋團隊成員")} placeholder={t("搜尋團隊成員")} value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}/></div>
    <div className="merchant-directory">{matches.slice(currentPage*6,(currentPage+1)*6).map(member=><button key={member.id} type="button" className="merchant-row" onClick={()=>setSelectedId(member.id)}>
      <ShieldCheck size={24} aria-hidden="true"/><span><strong>{member.name}</strong><small>{t(member.role)}</small></span>
      <span className="merchant-row-meta">{t(statusLabels[member.status])}</span><ChevronRight size={18} aria-hidden="true"/>
    </button>)}</div>
    {!matches.length && <p className="py-6 text-sm text-slate-500">{t("沒有符合的結果")}</p>}
    <MerchantPager page={currentPage} total={matches.length} size={6} onChange={setPage}/>
    <MerchantSheet open={!!selected} onClose={()=>setSelectedId(null)} title={t("成員權限")} description={selected?.name} busy={false}>
      {selected && <dl className="merchant-access-detail">
        <dt>{t("角色")}</dt><dd>{t(selected.role)}</dd>
        <dt>{t("狀態")}</dt><dd>{t(statusLabels[selected.status])}</dd>
        <dt>{t("適用範圍")}</dt><dd>{selected.scope==="organization" ? t("全品牌分店") : locationName}</dd>
        <dt>{t("權限維護")}</dt><dd>{t("目前僅供檢視")}</dd>
      </dl>}
    </MerchantSheet>
  </section>;
}

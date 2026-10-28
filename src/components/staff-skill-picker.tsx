"use client";
import {useLanguage} from "./language-provider";
import {useState, type ReactNode} from "react";
import {MerchantPager} from "./merchant-sheet";
import {useRemotePage} from "./use-remote-page";
import type {StaffSkill} from "@/server/merchant/staff-skills";

function SkillBrowser({scope,revision,children}:{scope:string;revision?:number;children:(items:StaffSkill[])=>ReactNode}) {
  const {t,errorText}=useLanguage();
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const remote=useRemotePage<StaffSkill>(`/api/merchant/staff/skills?${scope}&limit=8&offset=${page*8}&search=${encodeURIComponent(search)}`,revision);
  return <div data-skill-browser>
    <label className="block mb-3">{t("搜尋技能")}<input className="block w-full min-w-0 min-h-11 rounded border px-3" type="search" maxLength={100} value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}/></label>
    {(remote.loading || (!remote.data && !remote.error)) && <p role="status">{t("載入中")}</p>}
    {remote.error && <p role="alert">{errorText(remote.error)} <button type="button" className="min-h-11 px-3 font-semibold text-teal" onClick={remote.retry}>{t("重試")}</button></p>}
    {remote.data && <>
      {!remote.data.items.length && <p>{t(search ? "沒有符合的技能，請調整搜尋文字" : "尚未建立技能項目")}</p>}
      {children(remote.data.items)}
      <MerchantPager page={page} total={remote.data.total} size={8} onChange={setPage}/>
    </>}
  </div>;
}

export function StaffSkillPicker({scope,value,onChange,disabled=false,label="技能"}:{scope:string;value:string[];onChange:(value:string[])=>void;disabled?:boolean;label?:string}) {
  const {t}=useLanguage();
  return <fieldset className="merchant-skills" disabled={disabled}>
    <legend>{t(label)}</legend>
    <p className="text-sm mb-2">{t("已選技能")}：{value.length}</p>
    <SkillBrowser scope={scope}>{items=><div className="merchant-skill-options">{items.map(({id,name})=><label key={id}>
      <input type="checkbox" name="skills" value={name} checked={value.includes(name)} onChange={event=>onChange(event.target.checked ? [...value,name] : value.filter(skill=>skill!==name))}/>
      <span>{name}</span>
    </label>)}</div>}</SkillBrowser>
  </fieldset>;
}

export function SkillCatalogList({scope,revision}:{scope:string;revision:number}) {
  return <SkillBrowser scope={scope} revision={revision}>{items=><ul className="merchant-skill-catalog">{items.map(({id,name})=><li key={id}>{name}</li>)}</ul>}</SkillBrowser>;
}

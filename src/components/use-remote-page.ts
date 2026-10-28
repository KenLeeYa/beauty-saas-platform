"use client";
import {useEffect, useRef, useState} from "react";

export function useRemotePage<T, Metadata extends object = object>(url: string | null, revision?: unknown) {
  const [result,setResult]=useState<({url:string;items:T[];total:number}&Metadata) | null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [attempt,setAttempt]=useState(0);
  const request=useRef<AbortController | null>(null);
  useEffect(()=>{
    if(!url) return;
    const controller=new AbortController();
    request.current=controller;
    const timer=setTimeout(async()=>{
      if(controller.signal.aborted) return;
      setLoading(true);setError(null);
      try {
        const response=await fetch(url,{cache:"no-store",signal:controller.signal});
        const payload=await response.json() as {data?:{items:T[];total:number}&Metadata;error?:{message:string}};
        if(!response.ok || !payload.data) throw Error(payload.error?.message ?? "無法載入清單，請重試");
        if(!controller.signal.aborted) setResult({url,...payload.data});
      } catch(cause) {
        if(!controller.signal.aborted) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "無法載入清單，請重試");
      } finally {if(!controller.signal.aborted) setLoading(false);}
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[url,revision,attempt]);
  return {
    data:result?.url===url ? result : null,loading,error,retry:()=>setAttempt(value=>value+1),
    updateItems:(update:(items:T[])=>T[], refresh=true)=>{
      request.current?.abort();
      setLoading(false);
      setResult(current=>current?.url===url ? {...current,items:update(current.items)} : current);
      if(refresh) setAttempt(value=>value+1);
    },
  };
}

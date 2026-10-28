"use client";
import {useRef} from "react";
import Image from "next/image";
import {ImagePlus,LoaderCircle} from "lucide-react";

export function MerchantImage({src,alt,label,busy=false,square=false,onFile}: {
  src:string|null;alt:string;label:string;busy?:boolean;square?:boolean;onFile?: (file:File)=>void;
}) {
  const input=useRef<HTMLInputElement>(null);
  return <div className={`merchant-image ${square ? "merchant-image-square" : ""}`}>
    {src ? <Image src={src} alt={alt} width={square?96:640} height={square?96:240} unoptimized loader={({src})=>src}/>
      : <ImagePlus size={28} aria-hidden="true" className="text-slate-400"/>}
    {onFile && <>
      <button type="button" className="merchant-image-upload" title={label} aria-label={label} disabled={busy} onClick={()=>input.current?.click()}>
        {busy ? <LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true"/> : <ImagePlus size={20} aria-hidden="true"/>}
      </button>
      <input ref={input} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file) onFile(file);}}/>
    </>}
  </div>;
}

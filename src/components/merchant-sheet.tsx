"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {ChevronLeft, ChevronRight, X} from "lucide-react";
import {LanguageSwitcher, useLanguage} from "@/components/language-provider";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";

export function MerchantSheet({open, onClose, title, description, busy, children, footer, error, feedback}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  busy: boolean; children: ReactNode; footer?: ReactNode; error?: string | null; feedback?: string | null;
}) {
  const {t, errorText} = useLanguage();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !element) return;
    const viewport = window.visualViewport;
    const scrollBody = body.current;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty("--sheet-height", `${viewport?.height ?? innerHeight}px`);
        element.style.setProperty("--sheet-width", `${viewport?.width ?? innerWidth}px`);
        element.style.setProperty("--sheet-top", `${viewport?.offsetTop ?? 0}px`);
        element.style.setProperty("--sheet-left", `${viewport?.offsetLeft ?? 0}px`);
        frame = requestAnimationFrame(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !scrollBody?.contains(active)) return;
          const field = active.getBoundingClientRect(), visible = scrollBody.getBoundingClientRect();
          if (field.bottom > visible.bottom - 8) scrollBody.scrollTop += field.bottom - visible.bottom + 8;
          else if (field.top < visible.top + 8) scrollBody.scrollTop -= visible.top + 8 - field.top;
        });
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    scrollBody?.addEventListener("focusin", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      scrollBody?.removeEventListener("focusin", update);
    };
  }, [open, element]);
  return <Dialog open={open} onOpenChange={value => {if (!value && !busy) onClose();}}>
    <DialogContent ref={setElement} showCloseButton={false} className="merchant-sheet !translate-x-0 !translate-y-0"
      aria-busy={busy}
      onOpenAutoFocus={event => {
        event.preventDefault();
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        heading.current?.focus({preventScroll:true});
      }}
      onCloseAutoFocus={event => {event.preventDefault(); opener.current?.focus({preventScroll:true});}}
      onInteractOutside={event => {if (busy) event.preventDefault();}}
      onEscapeKeyDown={event => {if (busy) event.preventDefault();}}>
      <header className="merchant-sheet-header">
        <div className="min-w-0">
          <DialogTitle ref={heading} tabIndex={-1}>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>{description ?? title}</DialogDescription>
        </div>
        <LanguageSwitcher />
        <button type="button" className="merchant-icon" title={t("關閉")} aria-label={t("關閉")} disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="merchant-sheet-body" ref={body}>
        {error && <p className="merchant-error" role="alert">{errorText(error)}</p>}
        {feedback && <p className="merchant-success" role="status">{t(feedback)}</p>}
        {children}
      </div>
      {footer && <footer className="merchant-sheet-footer">{footer}</footer>}
    </DialogContent>
  </Dialog>;
}

export function MerchantPager({page, total, size, onChange}: {page:number; total:number; size:number; onChange:(page:number)=>void}) {
  const {t} = useLanguage();
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return <nav className="merchant-pager" aria-label={t("清單分頁")}>
    <span>{total === 0 ? 0 : page * size + 1}-{Math.min(total, (page + 1) * size)} / {total}</span>
    <button className="merchant-icon" type="button" disabled={page === 0} title={t("上一頁")} aria-label={t("上一頁")} onClick={()=>onChange(page-1)}><ChevronLeft size={18}/></button>
    <button className="merchant-icon" type="button" disabled={page >= last} title={t("下一頁")} aria-label={t("下一頁")} onClick={()=>onChange(page+1)}><ChevronRight size={18}/></button>
  </nav>;
}

export function useMerchantPagination<T>(items: readonly T[], size = 6) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(items.length / size) - 1));
  return {
    items: items.slice(page * size, (page + 1) * size),
    pager: items.length > size ? <MerchantPager page={page} total={items.length} size={size} onChange={setPage}/> : null,
    reset: () => setPage(0),
  };
}

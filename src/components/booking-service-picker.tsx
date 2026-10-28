"use client";

import { Check, ChevronLeft, ChevronRight, Clock3, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { PublicCatalog } from "@/server/public-booking/catalog";

type ServiceOption = PublicCatalog["services"][number]["variants"][number] & {
  serviceName: string;
  description: string | null;
  categoryName: string | null;
  imageUrl: string | null;
};

export function BookingServicePicker({ variants, selectedId, currency, disabled, onSelect }: {
  variants: ServiceOption[];
  selectedId: string;
  currency: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const { locale, t } = useLanguage();
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(variants.map(item => item.categoryName ?? ""))], [variants]);
  const activeCategory = category !== null && categories.includes(category) ? category : null;
  const items = variants.filter(item => activeCategory === null || (item.categoryName ?? "") === activeCategory);
  const rail = useRef<HTMLDivElement>(null);
  const focusFrame = useRef(0);
  const [edges, setEdges] = useState({ previous: false, next: false });
  // Refreshes and language changes preserve browsing position; only the actual option set resets it.
  const filterKey = JSON.stringify([activeCategory, items.map(item => item.id)]);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    node.scrollTo({ left: 0, behavior: "instant" });
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setEdges(previous => {
        const next = { previous: node.scrollLeft > 2, next: node.scrollLeft + node.clientWidth < node.scrollWidth - 2 };
        return previous.previous === next.previous && previous.next === next.next ? previous : next;
      }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame.current); observer.disconnect(); node.removeEventListener("scroll", update); };
  }, [filterKey]);

  function move(direction: number) {
    const node = rail.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-service-card]");
    node.scrollBy({ left: direction * ((card?.offsetWidth ?? node.clientWidth) + 12),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return (
    <div className="mt-4 min-w-0">
      <div role="group" aria-label={t("服務類型")} className="booking-service-types">
        {[null, ...categories].map(value => {
          const label = value === null ? t("全部服務") : value || t("一般服務");
          return <button key={value === null ? "all" : `category:${value}`} type="button"
            aria-label={label} aria-pressed={activeCategory === value} title={label}
            onClick={() => setCategory(value)}>
            {label}<span aria-hidden="true" className="ml-2 tabular-nums opacity-70">{value === null ? variants.length : variants.filter(item => (item.categoryName ?? "") === value).length}</span>
          </button>;
        })}
      </div>
      <div className="my-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-slate-600" role="status" aria-atomic="true">
          {activeCategory === null ? t("全部服務") : activeCategory || t("一般服務")} <span className="tabular-nums">({items.length})</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button className="utility-icon disabled:cursor-default disabled:opacity-30" type="button" aria-label={t("上一組服務")} title={t("上一組服務")}
            disabled={!edges.previous} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button>
          <button className="utility-icon disabled:cursor-default disabled:opacity-30" type="button" aria-label={t("下一組服務")} title={t("下一組服務")}
            disabled={!edges.next} onClick={() => move(1)}><ChevronRight aria-hidden="true" className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={rail} data-service-carousel role="group" aria-label={t("服務項目")} className="booking-service-rail">
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const duration = `${item.durationMinutes} ${t("分鐘")}`;
          return <button key={item.id} data-service-card={item.id} type="button" aria-pressed={selected}
            disabled={disabled} onClick={() => onSelect(item.id)} className="booking-service-card"
            onKeyDown={event => {
              const target = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
                : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
              if (target === null) return;
              event.preventDefault();
              const buttons = rail.current?.querySelectorAll<HTMLButtonElement>("[data-service-card]");
              const next = buttons?.[Math.max(0, Math.min(items.length - 1, target))];
              next?.focus({ preventScroll: true });
              next?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
              // Finish interrupting compositor scrolling before preserving keyboard focus.
              cancelAnimationFrame(focusFrame.current);
              focusFrame.current = requestAnimationFrame(() => {
                if (document.activeElement === next) next?.scrollIntoView({ block: "nearest", inline: "start", behavior: "instant" });
              });
            }}>
            {item.imageUrl ? <Image alt={`${item.serviceName} ${t("服務圖片")}`} src={item.imageUrl}
              width={640} height={280} unoptimized className="aspect-[16/7] w-full object-cover" /> : null}
            <span className="flex flex-1 flex-col p-4">
              <span className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-600">
                <span className="flex min-w-0 items-center gap-2"><Sparkles aria-hidden="true" className="h-4 w-4 text-coral" />{item.categoryName || t("一般服務")}</span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-teal bg-teal text-white' : 'border-slate-300'}`}>
                  {selected ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
                </span>
              </span>
              <span className="block text-lg font-semibold leading-7 text-ink">{item.serviceName}</span>
              <span className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
                <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4" />
                {item.name.trim() === `${item.durationMinutes} 分鐘` ? duration : `${item.name} · ${duration}`}
              </span>
              <span title={item.description ?? undefined} className="my-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.description}</span>
              <span className="mt-auto block border-t border-slate-200/70 pt-3 text-lg font-semibold tabular-nums text-ink">
                {new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(item.priceMinor / 100)}
              </span>
            </span>
          </button>;
        })}
      </div>
    </div>
  );
}

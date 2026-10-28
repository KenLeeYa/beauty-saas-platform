'use client';

import {createContext, useContext, useRef, useState, type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {Check, Languages, LoaderCircle} from 'lucide-react';
import {DropdownMenu} from 'radix-ui';
import {type LanguagePreference, type Locale} from '@/lib/i18n/locale';
import {translate, translateError} from '@/lib/i18n/messages';

type LanguageContext = {
  locale: Locale;
  preference: LanguagePreference;
  pending: boolean;
  failed: boolean;
  choose: (preference: LanguagePreference) => Promise<boolean>;
};
const Context = createContext<LanguageContext | null>(null);

export function LanguageProvider({locale: initialLocale, preference: initialPreference, children}: {
  locale: Locale; preference: LanguagePreference; children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [preference, setPreference] = useState(initialPreference);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  async function choose(next: LanguagePreference) {
    if (lock.current) return false;
    lock.current = true; setPending(true); setFailed(false);
    try {
      const [, route, identity] = window.location.pathname.split('/');
      const target = route === 'line-booking' && identity ? {store: decodeURIComponent(identity)} :
        route === 'booking' && identity ? {trackingToken: decodeURIComponent(identity)} : {};
      const response = await fetch('/api/preferences/language', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({preference: next, ...target}), signal: AbortSignal.timeout(10_000),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object' || !('locale' in data) ||
        (data.locale !== 'en' && data.locale !== 'zh-TW' && data.locale !== 'vi')) throw Error('language');
      setLocale(data.locale); setPreference(next);
      document.documentElement.lang = data.locale;
      router.refresh();
      return true;
    } catch {setFailed(true); return false;}
    finally {lock.current = false; setPending(false);}
  }
  return <Context.Provider value={{locale, preference, pending, failed, choose}}>{children}</Context.Provider>;
}

export function useLanguage() {
  const context = useContext(Context);
  const locale = context?.locale ?? 'zh-TW';
  return {...context, locale, t: (key: string) => translate(locale, key),
    errorText: (message: string) => translateError(locale, message)};
}

export function LanguageSwitcher({compact = false}: {compact?: boolean}) {
  const {t, preference, pending, failed, choose} = useLanguage();
  const [open, setOpen] = useState(false);
  const choices: Array<{value: LanguagePreference; label: string}> = [
    {value: 'auto', label: t('跟隨裝置')}, {value: 'zh-TW', label: '繁體中文'},
    {value: 'en', label: 'English'}, {value: 'vi', label: 'Tiếng Việt'},
  ];
  return <div className="shrink-0" data-language-control={compact ? 'dialog' : 'page'}>
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={t('語言')} title={t('語言')} className="utility-icon" data-language-trigger>
          {pending ? <LoaderCircle size={18} aria-hidden="true" className="animate-spin"/> : <Languages size={18} aria-hidden="true"/>}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={12} className="language-menu" aria-label={t('語言')}>
        {choices.map(choice => <DropdownMenu.Item key={choice.value} role="menuitemradio"
          aria-checked={(preference ?? 'auto') === choice.value} disabled={pending}
          data-language-option={choice.value} className="language-menu-item"
          onSelect={event => {event.preventDefault(); void choose?.(choice.value).then(saved => {if (saved) setOpen(false);});}}>
          <span>{choice.label}</span>{(preference ?? 'auto') === choice.value && <Check size={16} aria-hidden="true"/>}
        </DropdownMenu.Item>)}
        {failed && <p role="alert" className="px-3 py-2 text-sm text-red-700">{t('語言儲存失敗，請重試。')}</p>}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    {pending && <span className="sr-only" role="status">{t('正在儲存語言…')}</span>}
  </div>;
}

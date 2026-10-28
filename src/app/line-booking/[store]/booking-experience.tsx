'use client';

import {useEffect, useRef, useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {CalendarDays, ClipboardList, Clock, RefreshCw, UserRound, UsersRound} from 'lucide-react';
import {z} from 'zod';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {contactSchema, type BookingContact} from '@/lib/line-booking/contact-schema';
import {requestId} from '@/lib/line-booking/request-id';
import {formatDateInTimeZone} from '@/server/time/timezone';
import MemberSummary from './member-summary';
import ExceptionQueue from './exception-queue';
import AttendancePanel from './attendance-panel';
import styles from './booking.module.css';
import {LanguageSwitcher, useLanguage} from '@/components/language-provider';

type Catalog = {timezone: string; services: {id: string; name: string; duration_minutes: number}[]; staff: {id: string; name: string}[]; skills: {staff_id: string; service_id: string}[]};
type Booking = {id: string; service_id: string; staff_id: string; start: string; finish: string; service_name?: string; staff_name?: string; customer_name?: string; phone?: string; source?: string; busy?: boolean};
type Calendar = {role: 'owner' | 'reception' | 'staff'; bookings: Booking[]};
const availabilitySchema = z.object({slots: z.array(z.iso.datetime({offset: true}))});

function day(timezone: string) {
  return formatDateInTimeZone(new Date(), timezone);
}
export default function BookingExperience({store, preferredStaff, localDemo}: {store: string; preferredStaff: string; localDemo: boolean}) {
  const {locale, t, errorText} = useLanguage();
  function dateTime(value: string, timezone: string) {
    return new Intl.DateTimeFormat(locale, {timeZone: timezone, month: 'numeric', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value));
  }
  function clock(value: string, timezone: string) {
    return new Intl.DateTimeFormat(locale, {timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value));
  }
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [mine, setMine] = useState<Booking[]>([]);
  const [service, setService] = useState('');
  const [staff, setStaff] = useState(preferredStaff);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState('');
  const [workspaceView, setWorkspaceView] = useState('booking');
  const initialRoleView = useRef(false);
  const [step, setStep] = useState(1);
  const {register, handleSubmit, formState: {errors: formErrors}} = useForm<BookingContact>({resolver: zodResolver(contactSchema), defaultValues: {name: '', phone: ''}});
  const [source, setSource] = useState<'line' | 'phone' | 'personal-line'>('line');
  const [requestKey, setRequestKey] = useState(requestId);
  const [confirmation, setConfirmation] = useState('');
  const [editing, setEditing] = useState<Booking | null>(null);
  const editOpener = useRef<HTMLElement | null>(null);
  const [newDate, updateNewDate] = useState('');
  const [newSlots, setNewSlots] = useState<string[]>([]);
  const [newSlot, setNewSlot] = useState('');
  const [slotState, setSlotState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slotAttempt, setSlotAttempt] = useState(0);
  const [changeError, setChangeError] = useState('');
  function setNewDate(value: string) {
    setNewSlot(''); setNewSlots([]); updateNewDate(value); setSlotState('loading'); setChangeError('');
    setSlotAttempt(attempt => attempt + 1);
  }
  function retrySlots() {
    setNewSlot(''); setNewSlots([]); setSlotState('loading'); setChangeError('');
    setSlotAttempt(attempt => attempt + 1);
  }
  const [agendaDate, setAgendaDate] = useState('');
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [existingBookingToken, setExistingBookingToken] = useState('');
  const timezone = catalog?.timezone || 'Asia/Taipei';
  const chosenService = catalog?.services.find(item => item.id === service);
  const chosenStaff = catalog?.staff.find(item => item.id === staff);
  const qualified = catalog?.staff.filter(person => catalog.skills.some(skill => skill.staff_id === person.id && skill.service_id === service)) || [];

  useEffect(() => {
    let active = true;
    fetch(`/api/line-booking/catalog?store=${encodeURIComponent(store)}`, {cache: 'no-store'}).then(async response => {
      const data = await response.json() as Catalog & {error?: string};
      if (!response.ok || data.error) throw Error(data.error || '無法載入服務');
      if (!active) return;
      setCatalog(data); setService(data.services[0]?.id || '');
      setStaff(data.staff.some(person => person.id === preferredStaff) ? preferredStaff : localDemo ? data.staff[0]?.id || '' : 'any');
      setDate(day(data.timezone)); setAgendaDate(day(data.timezone));
    }).catch(cause => {if (active) setError(cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message : '無法載入服務');});
    return () => {active = false;};
  }, [store, preferredStaff, localDemo]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/line-booking/calendar?store=${encodeURIComponent(store)}`+
        (agendaDate ? `&date=${encodeURIComponent(agendaDate)}` : ''), {cache: 'no-store'}),
      fetch(`/api/line-booking/my-bookings?store=${encodeURIComponent(store)}`, {cache: 'no-store'}),
    ]).then(async ([staffResponse, mineResponse]) => {
      if (!active) return;
      const nextCalendar = staffResponse.ok ? await staffResponse.json() as Calendar : null;
      setAuthenticated(staffResponse.ok || mineResponse.ok);
      setCalendar(nextCalendar);
      if (!initialRoleView.current && nextCalendar) {
        initialRoleView.current = true;
        setWorkspaceView('agenda');
      }
      setMine(mineResponse.ok ? (await mineResponse.json() as {bookings: Booking[]}).bookings : []);
    }).catch(() => {if (active) setError('無法更新預約清單');});
    return () => {active = false;};
  }, [store, agendaDate, revision]);

  useEffect(() => {
    if (!service || !staff || !date) return;
    let active = true;
    const query = new URLSearchParams({store, service, date, ...(staff === 'any' ? {} : {staff})});
    fetch(`/api/line-booking/availability?${query}`, {cache: 'no-store'}).then(async response => {
      const data = await response.json() as {slots?: string[]; error?: string};
      if (!response.ok) throw Error(data.error || '無法查詢時段');
      if (active) setSlots(data.slots || []);
    }).catch(cause => {if (active) setError(cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message : '無法查詢時段');});
    return () => {active = false;};
  }, [store, service, staff, date, revision]);

  useEffect(() => {
    if (!editing || !newDate) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const query = new URLSearchParams({store, service: editing.service_id, staff: editing.staff_id, date: newDate});
    fetch(`/api/line-booking/availability?${query}`, {cache: 'no-store', signal: controller.signal}).then(async response => {
      if (!response.ok) throw Error('availability');
      const data = availabilitySchema.parse(await response.json());
      if (active) {setNewSlots(data.slots.filter(item =>
        item !== editing.start && formatDateInTimeZone(new Date(item), timezone) === newDate));
        setSlotState('ready');}
    }).catch(() => {if (active) {setNewSlots([]); setSlotState('error');}})
      .finally(() => clearTimeout(timeout));
    return () => {active = false; clearTimeout(timeout); controller.abort();};
  }, [store, editing, newDate, slotAttempt, timezone]);

  async function submit(contact: BookingContact) {
    if (!slot || !slots.includes(slot) || formatDateInTimeZone(new Date(slot), timezone) !== date || pending) return;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/line-booking/booking', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({store, serviceId: service, staffId: staff === 'any' ? undefined : staff, start: slot, name: contact.name, phone: contact.phone, source: calendar ? source : 'line', idempotencyKey: requestKey})});
      const data = await response.json() as {id?: string; error?: string};
      if (!response.ok) throw Error(data.error || '無法完成預約');
      setConfirmation(data.id || ''); setStep(4); setRevision(value => value + 1);
    } catch (cause) {setError(cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message : '無法完成預約');}
    finally {setPending(false);}
  }

  async function change(booking: Booking, action: 'cancel' | 'reschedule') {
    if (pending) return;
    if (action === 'reschedule' && (slotState !== 'ready' || !newSlots.includes(newSlot) ||
      formatDateInTimeZone(new Date(newSlot), timezone) !== newDate)) return;
    setPending(true); setError(''); setChangeError('');
    try {
      const response = await fetch(`/api/line-booking/booking/${booking.id}`, {method: 'PATCH', headers: {'content-type': 'application/json'}, body: JSON.stringify({store, action, ...(action === 'reschedule' ? {start: newSlot} : {})})});
      const data = await response.json() as {error?: string};
      if (!response.ok) throw Error(data.error || '無法更新預約');
      setEditing(null); setRevision(value => value + 1);
    } catch (cause) {
      const message = cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message :
        '無法確認更新結果，請確認連線後重試，或返回預約清單確認。';
      if (action === 'reschedule') setChangeError(message); else setError(message);
    }
    finally {setPending(false);}
  }

  function openEdit(booking: Booking) {editOpener.current = document.activeElement as HTMLElement;
    setEditing(booking); setNewDate(formatDateInTimeZone(new Date(booking.start), timezone)); setError('');}
  async function linkExistingCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/line-booking/link-customer', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({store, trackingToken: existingBookingToken.trim()}),
      });
      const data = await response.json() as {error?: string};
      if (!response.ok) throw Error(data.error || '無法連結預約，請確認憑證後再試。');
      setExistingBookingToken(''); setRevision(value => value + 1);
    } catch (cause) {setError(cause instanceof Error && /\p{Script=Han}/u.test(cause.message) ? cause.message : '無法連結預約，請確認憑證後再試。');}
    finally {setPending(false);}
  }
  const agenda = calendar?.bookings.filter(booking => formatDateInTimeZone(new Date(booking.start), timezone) === agendaDate) || [];
  const viewIcons = {booking: CalendarDays, mine: ClipboardList, member: UserRound,
    agenda: UsersRound, attendance: Clock};

  return <main id="main-content" className={styles.shell}>
    <header className={`${styles.hero} flex items-center justify-between gap-3`}><div className="min-w-0"><span className={styles.eyebrow}>{t("Lumi 美業")}</span><h1>{workspaceView === 'member' ? t("我的會員") : workspaceView === 'attendance' ? t("我的出勤") : workspaceView === 'mine' ? t("我的預約") : calendar ? t("今日工作") : t("線上預約")}</h1></div><LanguageSwitcher /></header>
    {localDemo ? <aside className={styles.demo}><strong>{t("本機測試模式")}</strong><span>{t("LINE 登入與通知均為模擬。")}</span><div className={styles.roles}>{(['customer', 'owner', 'staff-a', 'staff-b'] as const).map(role => <a key={role} href={`/api/line-booking/local-demo?store=${encodeURIComponent(store)}&role=${role}`}>{role}</a>)}</div></aside> : !authenticated && <a className={styles.login} href={`/api/line-booking/login?store=${encodeURIComponent(store)}`}>{t("使用 LINE 登入")}</a>}
    {!localDemo && workspaceView === 'member' && <MemberSummary key={`${store}:${revision}`} store={store} timezone={timezone} />}
    {!localDemo && workspaceView === 'member' && <details className={styles.panel} aria-label={t("連結既有預約")}>
      <summary>{t("連結既有預約")}</summary>
      <p className={styles.helper}>{t("使用預約確認連結中的識別碼驗證既有客戶；相同電話不會自動合併。")}</p>
      <form onSubmit={linkExistingCustomer} className={styles.fields}>
        <label htmlFor="existing-booking-token">{t("預約識別碼")}</label>
        <input id="existing-booking-token" value={existingBookingToken}
          onChange={event => setExistingBookingToken(event.target.value)}
          minLength={32} maxLength={512} autoComplete="off" required />
        <button type="submit" className={styles.primary} disabled={pending}>{t("連結預約")}</button>
      </form>
    </details>}
    <nav className={styles.tabs} aria-label={t("頁面區塊")}>{[
      ['booking', t("預約服務")], ['mine', t("我的預約")], ['member', t("會員")],
      ...(calendar ? [['agenda', t("店內行程")]] : []),
      ...(calendar?.role === 'staff' ? [['attendance', t("出勤")]] : []),
    ].map(([view,label]) => {const Icon = viewIcons[view as keyof typeof viewIcons]; return <button key={view} type="button"
      aria-current={workspaceView === view ? 'page' : undefined}
      onClick={() => setWorkspaceView(view)}><Icon size={20} aria-hidden="true"/>{label}</button>;})}</nav>
    {!localDemo && workspaceView === 'agenda' && <ExceptionQueue key={store} store={store} timezone={timezone} />}
    {!localDemo && workspaceView === 'attendance' && <AttendancePanel key={store} store={store} timezone={timezone} />}
    {error && <p role="alert" className={styles.error}>{errorText(error)}</p>}
    <section id="booking" hidden={workspaceView !== 'booking'} className={styles.panel}><div className={styles.heading}><div><h2>{t("預約服務")}</h2></div><span>{step === 4 ? t("完成") : `${step} / 3`}</span></div>
      {step === 4 ? <div className={styles.success} role="status"><div className={styles.check}>✓</div><h3>{t("預約已成立")}</h3><p>{chosenService?.name} · {chosenStaff?.name}</p><p>{dateTime(slot, timezone)}</p><small>{t("預約編號")}{confirmation}</small><button type="button" className={styles.secondary} onClick={() => {setStep(1); setConfirmation(''); setSlot(''); setRequestKey(requestId());}}>{t("再預約一筆")}</button></div> : <form onSubmit={handleSubmit(submit)}>
        <div className={styles.progress} aria-label={t("預約進度")}><span className={step >= 1 ? styles.active : ''}>{t("服務與人員")}</span><span className={step >= 2 ? styles.active : ''}>{t("日期與時間")}</span><span className={step >= 3 ? styles.active : ''}>{t("聯絡與確認")}</span></div>
        {step === 1 && <div className={styles.fields}><label htmlFor="service">{t("服務項目")}</label><select id="service" value={service} onChange={event => {const next = event.target.value; setSlot(''); setSlots([]); setService(next); if (staff !== 'any' && !catalog?.skills.some(skill => skill.staff_id === staff && skill.service_id === next)) setStaff(catalog?.skills.find(skill => skill.service_id === next)?.staff_id || '');}} required>{catalog?.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} {t("分鐘")}</option>)}</select><label htmlFor="staff">{t("美容師")}</label><select id="staff" value={staff} onChange={event => {setSlot(''); setSlots([]); setStaff(event.target.value);}} required>{!localDemo && <option value="any">{t("由店家安排")}</option>}{qualified.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className={styles.primary} disabled={!service || !staff} onClick={() => setStep(2)}>{t("選擇時間")}</button></div>}
        {step === 2 && <div className={styles.fields}><label htmlFor="date">{t("預約日期")}</label><input id="date" type="date" min={day(timezone)} value={date} onChange={event => {setSlot(''); setSlots([]); setDate(event.target.value);}} required/><fieldset className={styles.slotField}><legend>{t("可預約時段")}</legend><div className={styles.slotGrid}>{slots.map(item => <label key={item} className={slot === item ? styles.chosenSlot : styles.slot}><input type="radio" name="start" value={item} checked={slot === item} onChange={() => setSlot(item)}/>{clock(item, timezone)}</label>)}</div>{slots.length === 0 && <p className={styles.helper}>{t("這天尚無可用時段，請試試其他日期。")}</p>}</fieldset><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setStep(1)}>{t("上一步")}</button><button type="button" className={styles.primary} disabled={!slot} onClick={() => setStep(3)}>{t("填寫資料")}</button></div></div>}
        {step === 3 && <div className={styles.fields}><div className={styles.summary}><strong>{chosenService?.name}</strong><span>{chosenStaff?.name} · {chosenService?.duration_minutes} {t("分鐘")}</span><span>{dateTime(slot, timezone)}</span></div><label htmlFor="name">{t("姓名")}</label><input id="name" {...register('name')} autoComplete="name" aria-invalid={!!formErrors.name}/>{formErrors.name && <small role="alert">{errorText(formErrors.name.message ?? '請填寫姓名')}</small>}<label htmlFor="phone">{t("聯絡電話")}</label><input id="phone" type="tel" {...register('phone')} autoComplete="tel" aria-invalid={!!formErrors.phone}/>{formErrors.phone && <small role="alert">{errorText(formErrors.phone.message ?? '請填寫有效電話')}</small>}{calendar && <><label htmlFor="source">{t("預約來源")}</label><select id="source" value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="line">{t("LINE 自助預約")}</option><option value="phone">{t("電話代訂")}</option><option value="personal-line">{t("私人 LINE 代訂")}</option></select></>}<p className={styles.helper}>{t("確認時會重新檢查時段；若剛被預約，請選擇其他時間。")}</p><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setStep(2)}>{t("上一步")}</button><Button type="submit" className={styles.primary} disabled={pending}>{pending ? t("處理中…") : t("確認預約")}</Button></div></div>}
      </form>}
    </section>
    <section id="mine" hidden={workspaceView !== 'mine'} className={styles.panel}><div className={styles.heading}><div><h2>{t("我的預約")}</h2></div></div>{mine.length ? mine.map(booking => <article key={booking.id} data-booking-id={booking.id} className={styles.visit}><strong>{dateTime(booking.start, timezone)}</strong><span>{booking.service_name} · {booking.staff_name}</span><div className={styles.cardActions}><button type="button" onClick={() => openEdit(booking)}>{t("改期")}</button><button type="button" disabled={pending} onClick={() => change(booking, 'cancel')}>{t("取消")}</button></div></article>) : <p className={styles.helper}>{t("登入後，您在這間店的預約會顯示於此。")}</p>}</section>
    {calendar && <section id="agenda" hidden={workspaceView !== 'agenda'} className={styles.panel}><div className={styles.heading}><div><h2>{t("店內行程")}</h2></div><span className={styles.badge}>{calendar.role === 'owner' ? t("店主") : calendar.role === 'reception' ? t("櫃台") : t("美容師")}</span></div><label htmlFor="agenda-date">{t("查看日期")}</label><input id="agenda-date" type="date" value={agendaDate} onChange={event => setAgendaDate(event.target.value)}/>{agenda.length ? agenda.map(booking => <article key={booking.id} className={styles.visit}><strong>{dateTime(booking.start, timezone)}</strong><span>{booking.busy ? t("其他人員忙碌") : `${booking.service_name} · ${booking.staff_name} · ${booking.customer_name}`}</span>{!booking.busy && <><small>{booking.phone} · {booking.source === 'PHONE' ? t("電話預約") : booking.source === 'LINE' ? t("LINE 預約") : t("線上預約")}</small><div className={styles.cardActions}><button type="button" onClick={() => openEdit(booking)}>{t("改期")}</button><button type="button" disabled={pending} onClick={() => change(booking, 'cancel')}>{t("取消")}</button></div></>}</article>) : <p className={styles.helper}>{t("這天目前沒有預約。")}</p>}</section>}
    <Dialog open={!!editing} onOpenChange={open => {if (!open && !pending) setEditing(null);}}>
      <DialogContent className={`${styles.rescheduleDialog} max-sm:translate-x-0 max-sm:translate-y-0`} showCloseButton={!pending}
        onCloseAutoFocus={event => {event.preventDefault(); editOpener.current?.focus();}}>
        <header className={styles.rescheduleHeader}>
          <LanguageSwitcher compact />
          <DialogTitle>{t("更改預約時間")}</DialogTitle>
          <DialogDescription>{editing ? `${editing.service_name || t("服務")} · ${editing.staff_name || t("原美容師")}` : ''}</DialogDescription>
          {editing && <p className={styles.helper}>{t("原預約")} {dateTime(editing.start, timezone)}</p>}
        </header>
        <div className={styles.rescheduleBody}>
          <div className={styles.fields}>
            <label htmlFor="change-date">{t("新日期")}</label>
            <input id="change-date" type="date" min={day(timezone)} value={newDate}
              disabled={pending} onChange={event => setNewDate(event.target.value)}/>
          </div>
          <fieldset className={styles.slotField} disabled={pending} aria-busy={!!newDate && slotState === 'loading'}>
            <legend>{t("新時段")}</legend>
            {!newDate ? <p className={styles.helper}>{t("請先選擇新日期。")}</p> : slotState === 'loading' ?
              <p role="status" className={styles.helper}>{t("正在查詢可預約時段…")}</p> : slotState === 'error' ?
              <div className={styles.loadError}>
                <p role="alert">{t("無法載入可預約時段，請確認網路連線後重試。")}</p>
                <button type="button" className={styles.secondary} onClick={retrySlots}>
                  <RefreshCw size={16} aria-hidden="true"/>{t("重新載入時段")}</button>
              </div> : <>
                <div className={styles.slotGrid}>{newSlots.map(item => <label key={item} className={newSlot === item ? styles.chosenSlot : styles.slot}>
                  <input type="radio" name="new-start" value={item} checked={newSlot === item}
                    onChange={() => {setNewSlot(item); setChangeError('');}}/>{clock(item, timezone)}
                </label>)}</div>
                {newSlots.length === 0 && <p className={styles.helper}>{t("這天沒有其他可用時段。")}</p>}
              </>}
          </fieldset>
        </div>
        <footer className={styles.rescheduleFooter}>
          {changeError && <p role="alert" className={styles.error}>{errorText(changeError)}</p>}
          <p className={styles.selection} role="status">{newSlot ? `${t('改為')} ${dateTime(newSlot, timezone)}` : t("尚未選擇新時段")}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={pending} onClick={() => setEditing(null)}>{t("返回")}</button>
            <button type="button" className={styles.primary} disabled={!newSlot || slotState !== 'ready' || pending || !editing}
              onClick={() => {if (editing) change(editing, 'reschedule');}}>{pending ? t("確認中…") : t("確認改期")}</button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  </main>;
}

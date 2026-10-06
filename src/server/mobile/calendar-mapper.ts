export type MobileAgendaEntry = {
  id: string;
  staffId: string;
  start: string;
  finish: string;
  customerName: string;
  phone: string | null;
  serviceName: string;
  staffName: string | null;
  source: string;
};

export type MobileAgendaRow = {
  id: string;
  staff_id: string;
  start: string;
  finish: string;
  busy?: true;
  customer_name?: string;
  phone?: string | null;
  service_name?: string;
  staff_name?: string | null;
  source?: string;
};

export function maskMobileAgenda(
  entries: readonly MobileAgendaEntry[],
  canReadLocation: boolean,
  ownStaffId: string | null,
): MobileAgendaRow[] {
  return entries.map((entry) => {
    if (!canReadLocation && entry.staffId !== ownStaffId) {
      return {id:`busy:${entry.staffId}:${entry.start}`,staff_id:entry.staffId,
        start:entry.start,finish:entry.finish,busy:true};
    }
    return {id:entry.id,staff_id:entry.staffId,start:entry.start,finish:entry.finish,
      customer_name:entry.customerName,phone:entry.phone,
      service_name:entry.serviceName,staff_name:entry.staffName,source:entry.source};
  });
}

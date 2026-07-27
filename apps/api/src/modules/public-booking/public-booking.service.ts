import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PublicBooking,
  PublicBookingAppointmentStatus,
  PublicBookingCalendarDay,
  PublicBookingNotification,
  PublicBookingOptions
} from "@beauty-saas/shared";
import type { CreatePublicBookingInput, UpdateAppointmentStatusInput, UpdateBookingSlotInput } from "@beauty-saas/validation";

type AppointmentListFilters = {
  branchId?: string;
  staffId?: string;
  status?: PublicBookingAppointmentStatus;
  date?: string;
};

type CalendarAudience = "merchant" | "customer";

type SlotScope = {
  tenantId: string;
  branchId: string;
  staffId: string;
  date: string;
  time: string;
};

const activeAppointmentStatuses: PublicBookingAppointmentStatus[] = ["PENDING_CONFIRMATION", "CONFIRMED"];

const massageTenant: PublicBookingOptions = {
  tenant: {
    id: "tenant-demo",
    slug: "demo",
    name: "Lumi Beauty Studio",
    industryType: "BEAUTY",
    timezone: "Asia/Taipei",
    bookingNotice: "預約成立後會保留 15 分鐘，若需要改期請提前聯繫店家。"
  },
  branches: [
    {
      id: "branch-xinyi",
      name: "信義旗艦店",
      address: "台北市信義區松仁路 88 號",
      phone: "02-2345-6789",
      timezone: "Asia/Taipei"
    },
    {
      id: "branch-da-an",
      name: "大安舒活店",
      address: "台北市大安區復興南路 100 號",
      phone: "02-2233-8899",
      timezone: "Asia/Taipei"
    }
  ],
  services: [
    {
      id: "svc-face-basic",
      name: "保濕亮顏護理",
      category: "臉部保養",
      durationMinutes: 60,
      price: 1800,
      description: "清潔、保濕導入與舒緩修護，適合第一次體驗。"
    },
    {
      id: "svc-body-aroma",
      name: "芳療美體放鬆",
      category: "身體調理",
      durationMinutes: 90,
      price: 2600,
      description: "肩頸、背部與腿部舒緩，使用溫和植萃精油。"
    },
    {
      id: "svc-eyelash",
      name: "自然款美睫",
      category: "美睫",
      durationMinutes: 120,
      price: 2200,
      description: "依眼型調整長度與濃密度，完成自然乾淨妝感。"
    },
    {
      id: "svc-nail-gel",
      name: "單色凝膠美甲",
      category: "美甲",
      durationMinutes: 75,
      price: 1600,
      description: "含基礎修型與甲面整理，可現場加購款式。"
    }
  ],
  staff: [
    { id: "staff-any", name: "不指定服務人員", title: "由系統安排" },
    { id: "staff-mia", name: "Mia", title: "資深美容師" },
    { id: "staff-yuna", name: "Yuna", title: "美睫 / 美甲師" },
    { id: "staff-anne", name: "Anne", title: "芳療師" }
  ],
  availableDates: [
    {
      date: "2026-07-27",
      label: "7/6 週一",
      slots: ["10:00", "11:30", "14:00", "16:30", "19:00"]
    },
    {
      date: "2026-07-28",
      label: "7/7 週二",
      slots: ["10:30", "13:00", "15:30", "18:30"]
    },
    {
      date: "2026-07-29",
      label: "7/8 週三",
      slots: ["11:00", "12:30", "15:00", "17:30", "20:00"]
    },
    {
      date: "2026-07-30",
      label: "7/9 週四",
      slots: ["10:00", "14:30", "16:00", "19:30"]
    }
  ]
};

const bookings = new Map<string, PublicBooking>();
const closedSlots = new Set<string>();
const notifications: PublicBookingNotification[] = [];

function slotKey(scope: SlotScope): string {
  return [scope.tenantId, scope.branchId, scope.staffId, scope.date, scope.time].join(":");
}

function appointmentStartAt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dayLabel(date: string): string {
  const value = new Date(`${date}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Taipei"
  }).format(value);
}

@Injectable()
export class PublicBookingService {
  getBookingOptions(tenantSlug: string): PublicBookingOptions {
    if (tenantSlug !== massageTenant.tenant.slug) {
      throw new NotFoundException("Tenant booking page was not found.");
    }

    return {
      ...massageTenant,
      availableDates: massageTenant.availableDates.map((date) => ({
        ...date,
        label: dayLabel(date.date)
      }))
    };
  }

  createBooking(tenantSlug: string, input: CreatePublicBookingInput): PublicBooking {
    const options = this.getBookingOptions(tenantSlug);
    const branch = options.branches.find((item) => item.id === input.branchId);
    const service = options.services.find((item) => item.id === input.serviceId);
    const staff = options.staff.find((item) => item.id === input.staffId);
    const date = options.availableDates.find((item) => item.date === input.date);

    if (!branch || !service || !staff || !date?.slots.includes(input.time)) {
      throw new NotFoundException("Selected booking option is no longer available.");
    }

    const requestedSlot = {
      tenantId: options.tenant.id,
      branchId: branch.id,
      staffId: staff.id,
      date: input.date,
      time: input.time
    };

    if (closedSlots.has(slotKey(requestedSlot))) {
      throw new BadRequestException("Selected booking slot is closed.");
    }

    const hasConflict = Array.from(bookings.values()).some(
      (booking) =>
        booking.tenantId === options.tenant.id &&
        booking.branch.id === branch.id &&
        booking.staff.id === staff.id &&
        booking.appointment.date === input.date &&
        booking.appointment.time === input.time &&
        activeAppointmentStatuses.includes(booking.appointment.status)
    );

    if (hasConflict) {
      throw new BadRequestException("Selected booking slot already has a booking.");
    }

    const customer = {
      name: input.customerName,
      phone: input.customerPhone,
      ...(input.customerEmail ? { email: input.customerEmail } : {}),
      ...(input.note ? { note: input.note } : {})
    };
    const startAt = appointmentStartAt(input.date, input.time);
    const endAt = addMinutes(startAt, service.durationMinutes);
    const customerReminderAt = addMinutes(startAt, -60);

    const booking: PublicBooking = {
      id: crypto.randomUUID(),
      tenantId: options.tenant.id,
      branch,
      service,
      staff,
      customer,
      appointment: {
        date: input.date,
        time: input.time,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        customerReminderAt: customerReminderAt.toISOString(),
        durationMinutes: service.durationMinutes,
        status: "PENDING_CONFIRMATION"
      },
      createdAt: new Date().toISOString()
    };

    bookings.set(booking.id, booking);
    notifications.unshift({
      id: crypto.randomUUID(),
      tenantId: options.tenant.id,
      appointmentId: booking.id,
      title: "新預約完成",
      message: `${customer.name} 已預約 ${dayLabel(date.date)} ${input.time} 的 ${service.name}。`,
      createdAt: new Date().toISOString()
    });
    return booking;
  }

  listBookings(tenantSlug: string, filters: AppointmentListFilters): PublicBooking[] {
    const options = this.getBookingOptions(tenantSlug);

    return Array.from(bookings.values())
      .filter((booking) => booking.tenantId === options.tenant.id)
      .filter((booking) => !filters.branchId || booking.branch.id === filters.branchId)
      .filter((booking) => !filters.staffId || booking.staff.id === filters.staffId)
      .filter((booking) => !filters.status || booking.appointment.status === filters.status)
      .filter((booking) => !filters.date || booking.appointment.date === filters.date)
      .sort((left, right) => {
        const leftTime = `${left.appointment.date}T${left.appointment.time}`;
        const rightTime = `${right.appointment.date}T${right.appointment.time}`;
        return leftTime.localeCompare(rightTime);
      });
  }

  listCalendar(tenantSlug: string, audience: CalendarAudience, branchId?: string, staffId?: string): PublicBookingCalendarDay[] {
    const options = this.getBookingOptions(tenantSlug);
    const selectedBranchId = branchId || options.branches[0]?.id;
    const selectedStaffId = staffId || options.staff[0]?.id;

    if (!selectedBranchId || !selectedStaffId) {
      return [];
    }

    return options.availableDates.map((date) => ({
      date: date.date,
      label: date.label,
      slots: date.slots.map((time) => {
        const activeBooking = Array.from(bookings.values()).find(
          (booking) =>
            booking.tenantId === options.tenant.id &&
            booking.branch.id === selectedBranchId &&
            booking.staff.id === selectedStaffId &&
            booking.appointment.date === date.date &&
            booking.appointment.time === time &&
            activeAppointmentStatuses.includes(booking.appointment.status)
        );
        const closed = closedSlots.has(
          slotKey({
            tenantId: options.tenant.id,
            branchId: selectedBranchId,
            staffId: selectedStaffId,
            date: date.date,
            time
          })
        );

        if (activeBooking) {
          return {
            date: date.date,
            time,
            status: "BOOKED",
            label: audience === "merchant" ? activeBooking.customer.name : "已有顧客預約",
            branchId: selectedBranchId,
            staffId: selectedStaffId,
            ...(audience === "merchant"
              ? {
                  appointmentId: activeBooking.id,
                  customerName: activeBooking.customer.name,
                  serviceName: activeBooking.service.name,
                  servicePrice: activeBooking.service.price,
                  appointmentStatus: activeBooking.appointment.status
                }
              : {})
          };
        }

        if (closed) {
          return {
            date: date.date,
            time,
            status: "CLOSED",
            label: "不開放",
            branchId: selectedBranchId,
            staffId: selectedStaffId
          };
        }

        return {
          date: date.date,
          time,
          status: "AVAILABLE",
          label: "可預約",
          branchId: selectedBranchId,
          staffId: selectedStaffId
        };
      })
    }));
  }

  updateBookingSlot(tenantSlug: string, input: UpdateBookingSlotInput): PublicBookingCalendarDay[] {
    const options = this.getBookingOptions(tenantSlug);
    const date = options.availableDates.find((item) => item.date === input.date);
    const branch = options.branches.find((item) => item.id === input.branchId);
    const staff = options.staff.find((item) => item.id === input.staffId);

    if (!date?.slots.includes(input.time) || !branch || !staff) {
      throw new NotFoundException("Booking slot was not found.");
    }

    const activeBooking = Array.from(bookings.values()).find(
      (booking) =>
        booking.tenantId === options.tenant.id &&
        booking.branch.id === input.branchId &&
        booking.staff.id === input.staffId &&
        booking.appointment.date === input.date &&
        booking.appointment.time === input.time &&
        activeAppointmentStatuses.includes(booking.appointment.status)
    );

    if (activeBooking && !input.isOpen) {
      throw new BadRequestException("Booked slots cannot be closed.");
    }

    const key = slotKey({ tenantId: options.tenant.id, ...input });
    if (input.isOpen) {
      closedSlots.delete(key);
    } else {
      closedSlots.add(key);
    }

    return this.listCalendar(tenantSlug, "merchant", input.branchId, input.staffId);
  }

  listNotifications(tenantSlug: string): PublicBookingNotification[] {
    const options = this.getBookingOptions(tenantSlug);
    return notifications.filter((notification) => notification.tenantId === options.tenant.id);
  }

  updateBookingStatus(tenantSlug: string, bookingId: string, input: UpdateAppointmentStatusInput): PublicBooking {
    const options = this.getBookingOptions(tenantSlug);
    const booking = bookings.get(bookingId);

    if (!booking || booking.tenantId !== options.tenant.id) {
      throw new NotFoundException("Appointment was not found.");
    }

    const updated: PublicBooking = {
      ...booking,
      appointment: {
        ...booking.appointment,
        status: input.status,
        ...(input.note ? { statusNote: input.note } : {}),
        updatedAt: new Date().toISOString()
      }
    };

    bookings.set(updated.id, updated);
    return updated;
  }
}

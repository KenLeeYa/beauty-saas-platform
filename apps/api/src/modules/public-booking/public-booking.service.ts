import { Injectable, NotFoundException } from "@nestjs/common";
import type { PublicBooking, PublicBookingOptions } from "@beauty-saas/shared";
import type { CreatePublicBookingInput } from "@beauty-saas/validation";

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
      date: "2026-07-06",
      label: "7/6 週一",
      slots: ["10:00", "11:30", "14:00", "16:30", "19:00"]
    },
    {
      date: "2026-07-07",
      label: "7/7 週二",
      slots: ["10:30", "13:00", "15:30", "18:30"]
    },
    {
      date: "2026-07-08",
      label: "7/8 週三",
      slots: ["11:00", "12:30", "15:00", "17:30", "20:00"]
    },
    {
      date: "2026-07-09",
      label: "7/9 週四",
      slots: ["10:00", "14:30", "16:00", "19:30"]
    }
  ]
};

const bookings = new Map<string, PublicBooking>();

@Injectable()
export class PublicBookingService {
  getBookingOptions(tenantSlug: string): PublicBookingOptions {
    if (tenantSlug !== massageTenant.tenant.slug) {
      throw new NotFoundException("Tenant booking page was not found.");
    }

    return massageTenant;
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

    const customer = {
      name: input.customerName,
      phone: input.customerPhone,
      ...(input.customerEmail ? { email: input.customerEmail } : {}),
      ...(input.note ? { note: input.note } : {})
    };

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
        durationMinutes: service.durationMinutes,
        status: "PENDING_CONFIRMATION"
      },
      createdAt: new Date().toISOString()
    };

    bookings.set(booking.id, booking);
    return booking;
  }
}

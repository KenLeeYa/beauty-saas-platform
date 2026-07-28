import { notFound } from "next/navigation";

import { PublicBookingFlow } from "@/components/public-booking-flow";
import { getCurrentSession } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { getPublicBooking } from "@/server/public-booking/booking";
import { getPublicCatalog } from "@/server/public-booking/catalog";
import { getServerEnv } from "@/server/env";
import {
  addLocalDays,
  formatDateInTimeZone,
} from "@/server/time/timezone";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    organizationSlug: string;
    locationSlug: string;
  }>;
  searchParams: Promise<{
    reschedule?: string;
  }>;
};

export default async function PublicBookingPage({
  params,
  searchParams,
}: PageProps) {
  const route = await params;
  const query = await searchParams;
  let catalog: Awaited<ReturnType<typeof getPublicCatalog>>;
  let rescheduleBooking: Awaited<ReturnType<typeof getPublicBooking>> | null;

  try {
    catalog = await getPublicCatalog(route);
    rescheduleBooking = query.reschedule
      ? await getPublicBooking(query.reschedule)
      : null;
    if (
      rescheduleBooking &&
      (!rescheduleBooking.booking.customerActions.rescheduleEnabled ||
        rescheduleBooking.booking.location.name !== catalog.location.name)
    ) {
      notFound();
    }
  } catch (error) {
    if (
      error instanceof AppError &&
      ["NOT_FOUND", "CONFLICT"].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  const today = formatDateInTimeZone(
    new Date(),
    catalog.location.timezone,
  );
  const hoursByDay = new Map<number, boolean>();
  for (const hours of catalog.businessHours) {
    if (!hours.isClosed) {
      hoursByDay.set(hours.dayOfWeek, true);
    }
  }
  const calendarDays = Array.from(
    { length: catalog.location.maximumAdvanceDays + 1 },
    (_, index) => {
      const date = addLocalDays(today, index);
      const dayOfWeek = new Date(
        `${date}T12:00:00.000Z`,
      ).getUTCDay();
      const isOpen = hoursByDay.get(dayOfWeek) ?? false;
      return {
        date,
        availableCount: isOpen ? 1 : 0,
        bookedCount: 0,
        closedCount: isOpen ? 0 : 1,
      };
    },
  );
  const initialDate =
    calendarDays.find((day) => day.availableCount > 0)?.date ?? today;
  const env = getServerEnv();
  const session = await getCurrentSession();

  return (
    <PublicBookingFlow
      authenticated={Boolean(session)}
      calendarDays={calendarDays}
      catalog={catalog}
      initialDate={initialDate}
      localTurnstileBypass={
        env.APP_ENV !== "production" && env.TURNSTILE_ALLOW_TEST_KEYS
      }
      lockedVariantId={rescheduleBooking?.booking.service.variantId}
      rescheduleTrackingToken={
        rescheduleBooking ? query.reschedule : undefined
      }
      turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
    />
  );
}

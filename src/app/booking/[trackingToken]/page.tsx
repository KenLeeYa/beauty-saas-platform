import { notFound } from "next/navigation";

import { BookingManage } from "@/components/booking-manage";
import { AppError } from "@/server/http/errors";
import { getPublicBooking } from "@/server/public-booking/booking";

export const dynamic = "force-dynamic";

export default async function BookingTrackingPage({
  params,
}: {
  params: Promise<{
    trackingToken: string;
  }>;
}) {
  const { trackingToken } = await params;
  let summary: Awaited<ReturnType<typeof getPublicBooking>>;

  try {
    summary = await getPublicBooking(trackingToken);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return <BookingManage initialSummary={summary} />;
}

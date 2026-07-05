import { BookingExperience } from "./booking-experience";

export default async function BookingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;

  return <BookingExperience tenantSlug={tenantSlug} />;
}

import { BookingExperience } from "./booking-experience";
import { redirect } from "next/navigation";
import { getCurrentSession, sessionDestination } from "../../../../lib/demo-auth";

export default async function BookingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();

  if (!session) {
    redirect("/");
  }

  if (session.role !== "customer") {
    redirect(sessionDestination(session));
  }

  if (session.tenantSlug !== tenantSlug) {
    redirect(`/t/${session.tenantSlug}/booking`);
  }

  return <BookingExperience customerEmail={session.email} customerName={session.displayName} tenantSlug={tenantSlug} />;
}

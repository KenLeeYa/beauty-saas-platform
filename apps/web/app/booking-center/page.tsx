import { redirect } from "next/navigation";
import { getCurrentSession, sessionDestination } from "../../lib/demo-auth";

export default async function LegacyBookingCenterPage() {
  const session = await getCurrentSession();
  redirect(session ? sessionDestination(session) : "/");
}

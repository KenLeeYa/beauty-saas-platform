import { AppointmentsDashboard } from "./appointments-dashboard";
import { getCurrentSession } from "../../../lib/demo-auth";
import { redirect } from "next/navigation";

export default async function AppointmentsPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "merchant") {
    redirect("/");
  }

  return <AppointmentsDashboard displayName={session.displayName} tenantSlug={session.tenantSlug} />;
}

import { redirect } from "next/navigation";
import { getCurrentSession, sessionDestination } from "../../lib/demo-auth";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/");
  }

  if (session.role !== "merchant") {
    redirect(sessionDestination(session));
  }

  return children;
}


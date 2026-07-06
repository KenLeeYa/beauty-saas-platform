import Link from "next/link";

const modules = [
  { label: "Branches", href: "/app", detail: "Manage shop locations and timezone settings." },
  { label: "Staff", href: "/app", detail: "Manage beauticians, roles, and schedules." },
  { label: "Services", href: "/app", detail: "Maintain service menu, duration, and pricing." },
  { label: "Customers", href: "/app", detail: "Review customer profiles and notes." },
  { label: "Appointments", href: "/app/appointments", detail: "Review online bookings and update status." },
  { label: "Reports", href: "/app", detail: "Track revenue, utilization, and branch performance." },
  { label: "Settings", href: "/app", detail: "Configure tenant preferences and permissions." }
];

export default function TenantAppPage() {
  return (
    <main className="min-h-screen bg-mist px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-ink">Shop Admin</h1>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.label} className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal" href={module.href}>
              <p className="font-medium text-ink">{module.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.detail}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

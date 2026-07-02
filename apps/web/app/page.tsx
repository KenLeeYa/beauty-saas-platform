import Link from "next/link";

const links = [
  { href: "/platform", label: "Platform", detail: "Tenants, templates, plans, audit." },
  { href: "/app", label: "Shop Admin", detail: "Branches, staff, services, customers." },
  { href: "/t/demo/booking", label: "Public Booking", detail: "Tenant-scoped booking entry." }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-mist px-6 py-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal">Beauty SaaS Platform</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold text-ink md:text-6xl">Multi-tenant beauty operations.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            A phase-one foundation for tenant isolation, branch scope, RBAC, appointments, customers, storage, and jobs.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal">
              <span className="text-lg font-semibold text-ink">{link.label}</span>
              <p className="mt-2 text-sm leading-6 text-slate-600">{link.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

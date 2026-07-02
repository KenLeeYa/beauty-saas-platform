const modules = ["Branches", "Staff", "Services", "Customers", "Appointments", "Reports", "Settings"];

export default function TenantAppPage() {
  return (
    <main className="min-h-screen bg-mist px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-ink">Shop Admin</h1>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {modules.map((module) => (
            <section key={module} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-medium text-ink">{module}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

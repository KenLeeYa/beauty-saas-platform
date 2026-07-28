const metrics = [
  ["Tenants", "0"],
  ["Active plans", "0"],
  ["Open incidents", "0"],
  ["Audit events", "0"]
];

export default function PlatformPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-semibold text-ink">Platform</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {metrics.map(([label, value]) => (
            <section key={label} className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

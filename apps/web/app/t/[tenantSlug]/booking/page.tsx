export default async function BookingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;

  return (
    <main className="min-h-screen bg-mist px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-teal">{tenantSlug}</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Booking</h1>
        <p className="mt-4 text-slate-600">Tenant-scoped public booking flow placeholder.</p>
      </div>
    </main>
  );
}

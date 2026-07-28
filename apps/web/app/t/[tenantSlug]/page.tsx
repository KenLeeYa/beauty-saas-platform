export default async function TenantPublicPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-coral">{tenantSlug}</p>
        <h1 className="mt-3 text-4xl font-semibold text-ink">Public tenant page</h1>
      </div>
    </main>
  );
}

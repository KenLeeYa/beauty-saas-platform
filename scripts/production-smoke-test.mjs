const appUrl =
  process.argv[2] ??
  process.env.PRODUCTION_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL;

if (!appUrl) {
  throw new Error(
    "Provide the production URL as the first argument or PRODUCTION_APP_URL.",
  );
}

const baseUrl = new URL(appUrl).origin;
const failures = [];

async function request(path, options = {}) {
  try {
    return await fetch(new URL(path, baseUrl), {
      ...options,
      redirect: options.redirect ?? "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : "request failed"}`);
    return null;
  }
}

const health = await request("/api/health");
if (!health || health.status !== 200) {
  failures.push(`/api/health: expected 200, received ${health?.status ?? "no response"}`);
} else {
  const payload = await health.json();
  if (payload.status !== "ok") {
    failures.push("/api/health: database health is not ok");
  }
}

const login = await request("/");
if (!login || login.status !== 200) {
  failures.push(`/: expected 200, received ${login?.status ?? "no response"}`);
} else {
  const body = await login.text();
  if (!body.includes("登入預約空間")) {
    failures.push("/: login surface was not rendered");
  }
  const requiredHeaders = new Map([
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
  ]);
  for (const [name, expected] of requiredHeaders) {
    if (login.headers.get(name) !== expected) {
      failures.push(`/: ${name} header is missing or incorrect`);
    }
  }
  if (!login.headers.get("content-security-policy")) {
    failures.push("/: content-security-policy header is missing");
  }
}

const oauthStart = await request("/auth/google", { redirect: "manual" });
const oauthLocation = oauthStart?.headers.get("location");
if (
  !oauthStart ||
  ![302, 303, 307, 308].includes(oauthStart.status) ||
  !oauthLocation
) {
  failures.push("/auth/google: expected a redirect to Supabase Auth");
} else {
  const authorizeUrl = new URL(oauthLocation);
  if (
    authorizeUrl.pathname !== "/auth/v1/authorize" ||
    authorizeUrl.searchParams.get("provider") !== "google"
  ) {
    failures.push("/auth/google: Supabase Google authorization URL is invalid");
  } else {
    const provider = await request(authorizeUrl.toString(), {
      redirect: "manual",
    });
    const providerLocation = provider?.headers.get("location");
    if (
      !provider ||
      ![302, 303, 307, 308].includes(provider.status) ||
      !providerLocation ||
      new URL(providerLocation).hostname !== "accounts.google.com"
    ) {
      failures.push(
        "/auth/google: Supabase Google provider is disabled or misconfigured",
      );
    }
  }
}

const booking = await request("/book/preview/taipei");
if (!booking || booking.status !== 200) {
  failures.push(
    `/book/preview/taipei: expected 200, received ${booking?.status ?? "no response"}`,
  );
}

const catalog = await request(
  "/api/public/catalog?organizationSlug=preview&locationSlug=taipei",
);
if (!catalog || catalog.status !== 200) {
  failures.push(
    `/api/public/catalog: expected 200, received ${catalog?.status ?? "no response"}`,
  );
} else {
  const payload = await catalog.json();
  if (!payload.data?.services?.length) {
    failures.push("/api/public/catalog: preview service catalog is empty");
  }
}

const merchant = await request("/merchant");
if (!merchant || merchant.status !== 200 || new URL(merchant.url).pathname !== "/") {
  failures.push("/merchant: unauthenticated request was not redirected to login");
}

const cron = await request("/api/cron/notifications", { redirect: "manual" });
if (!cron || cron.status !== 401) {
  failures.push(
    `/api/cron/notifications: unauthenticated request expected 401, received ${cron?.status ?? "no response"}`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Production smoke checks passed for ${baseUrl}.`);
}

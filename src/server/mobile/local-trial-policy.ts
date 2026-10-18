type TrialEnvironment = Readonly<Record<string, string | undefined>>;

export function localTrialOrigin(requestUrl: string, host: string | null,
  environment: TrialEnvironment): string | null {
  if (environment.APP_ENV !== "test" || environment.UNIFIED_LOCAL_TRIAL !== "true") return null;
  try {
    const url = new URL(requestUrl);
    const database = new URL(environment.DATABASE_URL || "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)) return null;
    if (url.protocol !== "http:" || url.host !== host) return null;
    const address = url.hostname;
    const parts = address.split(".").map(Number);
    const privateIpv4 = parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
      (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(address);
    if (!loopback && !privateIpv4) return null;
    const allowed = environment.UNIFIED_LOCAL_TRIAL_ORIGINS?.split(",").map(item => item.trim());
    if (allowed ? !allowed.includes(url.origin) : !loopback) return null;
    return url.origin;
  } catch { return null; }
}

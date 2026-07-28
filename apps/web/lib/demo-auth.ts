import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export type AppRole = "merchant" | "customer";

export type AppSession = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  tenantSlug: string;
  expiresAt: number;
};

type DemoUser = Omit<AppSession, "id" | "expiresAt"> & {
  password: string;
};

const sessionCookieName = "beauty_demo_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;

const demoUsers: DemoUser[] = [
  {
    userId: "user-merchant-demo",
    email: "merchant@lumi.test",
    password: "Beauty123!",
    displayName: "Lumi 店家管理員",
    role: "merchant",
    tenantSlug: "demo"
  },
  {
    userId: "user-customer-demo",
    email: "customer@lumi.test",
    password: "Beauty123!",
    displayName: "林小姐",
    role: "customer",
    tenantSlug: "demo"
  }
];

const authGlobal = globalThis as typeof globalThis & {
  beautyDemoSessions?: Map<string, AppSession>;
};

const sessions = authGlobal.beautyDemoSessions ?? new Map<string, AppSession>();
authGlobal.beautyDemoSessions = sessions;

export const demoCredentials = {
  merchant: {
    email: "merchant@lumi.test",
    password: "Beauty123!"
  },
  customer: {
    email: "customer@lumi.test",
    password: "Beauty123!"
  }
} as const;

export function authenticateDemoUser(email: string, password: string): DemoUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  return demoUsers.find((user) => user.email === normalizedEmail && user.password === password) ?? null;
}

export function createDemoSession(user: DemoUser): AppSession {
  const session: AppSession = {
    id: randomUUID(),
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    tenantSlug: user.tenantSlug,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000
  };

  sessions.set(session.id, session);
  return session;
}

export function deleteDemoSession(sessionId: string | undefined): void {
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

export async function getCurrentSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName)?.value;
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export function sessionDestination(session: Pick<AppSession, "role" | "tenantSlug">): string {
  return session.role === "merchant" ? "/app/appointments" : `/t/${session.tenantSlug}/booking`;
}

export const sessionCookie = {
  name: sessionCookieName,
  maxAge: sessionMaxAgeSeconds
} as const;


import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateDemoUser,
  createDemoSession,
  sessionCookie,
  sessionDestination
} from "../../../../lib/demo-auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "請輸入有效的 Email 與密碼。" }, { status: 400 });
  }

  const user = authenticateDemoUser(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "帳號或密碼不正確。" }, { status: 401 });
  }

  const session = createDemoSession(user);
  const response = NextResponse.json({
    role: session.role,
    redirectTo: sessionDestination(session)
  });

  response.cookies.set(sessionCookie.name, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionCookie.maxAge
  });

  return response;
}


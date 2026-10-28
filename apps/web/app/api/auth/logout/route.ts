import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteDemoSession, sessionCookie } from "../../../../lib/demo-auth";

export async function POST() {
  const cookieStore = await cookies();
  deleteDemoSession(cookieStore.get(sessionCookie.name)?.value);

  const response = NextResponse.json({ success: true });
  response.cookies.set(sessionCookie.name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}


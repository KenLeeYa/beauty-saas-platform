import { NextResponse } from "next/server";
import { getCurrentSession } from "../../../../lib/demo-auth";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ session: null }, { status: 401 });
  }

  return NextResponse.json({
    session: {
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      tenantSlug: session.tenantSlug
    }
  });
}


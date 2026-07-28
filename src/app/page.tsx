import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { resolveSessionDestination } from "@/server/auth/destination";
import {
  getOAuthErrorMessage,
  normalizeRelativeRedirect,
} from "@/server/auth/oauth";
import { getCurrentSession } from "@/server/auth/session";
import { getServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    oauthError?: string;
  }>;
}) {
  const session = await getCurrentSession();
  const params = await searchParams;
  const requestedNext = normalizeRelativeRedirect(params.next) ?? undefined;
  if (session) {
    redirect(
      requestedNext ??
        (await resolveSessionDestination({
          profileId: session.profileId,
          platformRole: session.platformRole,
        })),
    );
  }

  const env = getServerEnv();

  return (
    <main
      id="main-content"
      className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]"
    >
      <section className="relative hidden min-h-screen overflow-hidden lg:block">
        <Image
          alt="明亮整潔的美容工作室接待與護理空間"
          className="object-cover"
          fill
          priority
          sizes="55vw"
          src="/images/login-studio.png"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-10 py-9 text-white">
          <p className="text-sm font-semibold">Lumi Beauty Studio</p>
          <p className="mt-2 max-w-xl text-2xl font-semibold leading-9">
            從預約、排班到顧客關係，讓每一天的營運更清楚。
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-12">
        <LoginForm
          googleEnabled={env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED}
          localAuthEnabled={
            env.ENABLE_LOCAL_AUTH_STUB && env.APP_ENV !== "production"
          }
          initialError={getOAuthErrorMessage(params.oauthError)}
          nextPath={requestedNext}
        />
      </section>
    </main>
  );
}

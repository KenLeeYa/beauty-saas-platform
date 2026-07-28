import type { NextRequest } from "next/server";

import { jsonError, jsonSuccess } from "@/server/http/response";
import { getPublicCatalog } from "@/server/public-booking/catalog";
import { publicLocationSchema } from "@/server/public-booking/schemas";
import { getRequestId } from "@/server/security/request";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const input = publicLocationSchema.parse({
      organizationSlug: request.nextUrl.searchParams.get(
        "organizationSlug",
      ),
      locationSlug: request.nextUrl.searchParams.get("locationSlug"),
    });
    const catalog = await getPublicCatalog(input);

    return jsonSuccess(catalog, {
      headers: {
        "cache-control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

import type { RequestContext } from "@beauty-saas/shared";

export type ApiRequest = {
  headers: Record<string, string | string[] | undefined>;
  context?: RequestContext;
};

export function readHeader(request: ApiRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

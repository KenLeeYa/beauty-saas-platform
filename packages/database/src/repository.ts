import type { RequestContext } from "@beauty-saas/shared";

export type TenantScopedRepository = {
  readonly context: RequestContext;
};

export type UnitOfWork<TConnection> = {
  transaction<TResult>(context: RequestContext, work: (connection: TConnection) => Promise<TResult>): Promise<TResult>;
};

export interface DatabaseService<TConnection = unknown> {
  readonly connection: TConnection;
  withTenantContext<TResult>(context: RequestContext, work: (connection: TConnection) => Promise<TResult>): Promise<TResult>;
}

export function tenantWhere(context: Pick<RequestContext, "activeTenantId">): { tenantId: string } {
  return { tenantId: context.activeTenantId };
}

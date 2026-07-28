# Shared Backend Compatibility

## Goal

StallOrder and Beauty may share contracts and review checklists in the future,
but neither production system may import the other repository or connect to the
other product's database.

## Candidate Platform-Core Contracts

```ts
export interface SessionStore {
  create(profileId: string): Promise<{
    token: string;
    csrfToken: string;
    expiresAt: Date;
  }>;
  revoke(tokenHash: string): Promise<void>;
}

export interface EntitlementResolver<TFeature extends string> {
  resolve(
    organizationId: string,
    feature: TFeature
  ): Promise<{ allowed: boolean; limit: number | null; source: string }>;
}

export interface AuditWriter {
  record(event: {
    organizationId?: string;
    locationId?: string;
    actorProfileId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    requestId: string;
    outcome: "SUCCESS" | "DENIED" | "FAILURE";
  }): Promise<void>;
}

export interface NotificationAdapter {
  readonly channel: string;
  readonly configured: boolean;
  send(message: unknown): Promise<{ providerMessageId: string }>;
}
```

## Shared Invariants

- Auth identity and application membership are separate.
- Raw high-value tokens are never stored.
- Mutations require session, same-origin, CSRF, rate limit, capability, and scope.
- Tenant-owned data has explicit organization scope; branch-owned data also has
  explicit child scope and parent consistency enforcement.
- Business writes use trusted services, transactions, append-only events, and audit.
- External providers are disabled and fail closed when credentials are absent.

## Deliberate Non-Compatibility

StallOrder product, order, QR, pickup, kitchen, dining table, and cash-shift
contracts are not platform-core. Beauty service duration, staff skills,
resources, CRM sensitivity, booking holds, deposits, and cancellation policies
remain Beauty-specific.

No cross-repository runtime package is introduced in this phase.

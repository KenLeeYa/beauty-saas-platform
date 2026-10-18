# Feature Flags

Feature resolution order:

1. Tenant override
2. Subscription plan
3. Industry template default
4. Global default

APIs that depend on optional modules must check feature flags before running business logic.

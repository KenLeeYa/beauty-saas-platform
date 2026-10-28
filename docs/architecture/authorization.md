# Authorization

Authorization combines RBAC and branch scope.

Tenant roles grant permission keys such as `appointment.read`, `customer.update`, and `report.branch.read`. Branch-scoped roles must also pass branch membership checks before accessing branch-owned records.

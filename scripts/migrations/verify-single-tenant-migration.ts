type VerificationResult = {
  name: string;
  passed: boolean;
  details?: string;
};

const checks: VerificationResult[] = [
  { name: "default tenant exists", passed: false, details: "Implement database-backed check before running production migration." },
  { name: "default branch exists", passed: false, details: "Implement database-backed check before running production migration." },
  { name: "legacy users mapped to tenant memberships", passed: false },
  { name: "appointments have tenant_id and branch_id", passed: false },
  { name: "customers have tenant_id", passed: false }
];

for (const check of checks) {
  const status = check.passed ? "PASS" : "TODO";
  console.log(`${status} ${check.name}${check.details ? ` - ${check.details}` : ""}`);
}

if (checks.some((check) => !check.passed)) {
  process.exitCode = 1;
}

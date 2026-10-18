import {readFileSync} from 'node:fs';
import {previewLegacyImport} from '../src/lib/line-booking/legacy-adapter';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run booking:legacy-preview -- <scoped-snapshot.json>');
  process.exit(2);
}
try {
  const plan = previewLegacyImport(JSON.parse(readFileSync(input, 'utf8')) as unknown);
  // Deliberately exclude customer names and phone numbers from the console report.
  console.log(JSON.stringify({
    services: plan.services.length, staff: plan.staff.length,
    resources: plan.resources.length, skills: plan.skills.length,
    resourceRequirements: plan.requirements.length, futureBookings: plan.bookings.length,
    mappedWithoutDetectedIssues: plan.issues.length === 0, issues: plan.issues,
  }, null, 2));
  if (plan.issues.length) process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid snapshot');
  process.exitCode = 2;
}

import type {feature_key} from '@prisma/client';

const essential=new Set<feature_key>([
  'ONLINE_BOOKING','BASIC_CALENDAR','STAFF_SCHEDULING','RESOURCE_MANAGEMENT',
]);
const legacyDefaultActive=new Set<feature_key>([
  'CUSTOMER_CRM','CUSTOMER_BLACKLIST','CUSTOMER_MEDIA','BUSINESS_HOURS',
  'DEPOSITS','CANCELLATION_RULES','MULTI_LOCATION','CSV_EXPORT',
  'ADVANCED_REPORTS','SCHEDULED_REPORTS','CUSTOM_BRANDING',
  'LINE_NOTIFICATIONS','EMAIL_NOTIFICATIONS','AUDIT_VIEWER',
]);

export function resolveModuleVisibility(feature:feature_key,
  planEnabled:boolean,storeActive:boolean|null):boolean {
  if(essential.has(feature))return true;
  if(!planEnabled)return false;
  return storeActive??legacyDefaultActive.has(feature);
}

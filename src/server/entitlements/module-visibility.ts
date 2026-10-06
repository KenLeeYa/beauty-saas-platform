import 'server-only';

import {Prisma,type feature_key} from '@prisma/client';

import type {OrganizationContext} from '../authorization/context';
import {prisma} from '../database/prisma';
import {AppError} from '../http/errors';
import {getEntitlement} from './service';
import {resolveModuleVisibility} from './module-visibility-policy';

export async function canShowModule(context:OrganizationContext,feature:feature_key):Promise<boolean> {
  const decision=await getEntitlement(context.organization.id,feature);
  if(!context.location)return resolveModuleVisibility(feature,decision.enabled,null);
  const rows=await prisma.$queryRaw<{isActive:boolean}[]>(Prisma.sql`
    select is_active as "isActive" from public.store_module_activations
    where organization_id=${context.organization.id}::uuid
      and location_id=${context.location.id}::uuid
      and feature_key=${feature}::public.feature_key limit 1
  `);
  return resolveModuleVisibility(feature,decision.enabled,rows[0]?.isActive??null);
}

export async function requireModule(context:OrganizationContext,feature:feature_key):Promise<void> {
  if(!await canShowModule(context,feature))
    throw new AppError('FEATURE_UNAVAILABLE','Module is not enabled for this store',403);
}

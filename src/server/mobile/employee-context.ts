import 'server-only';

import type {VerifiedMobileActor} from '../auth/line-mobile-session';
import {resolveOrganizationContext} from '../authorization/context';
import {prisma} from '../database/prisma';
import {AppError} from '../http/errors';
import type {PublicLocationContext} from '../public-booking/context';

export async function resolveMobileEmployeeContext(actor:VerifiedMobileActor,
  store:PublicLocationContext) {
  if(actor.kind!=='employee' || !actor.profileId ||
      actor.organizationId!==store.organizationId || actor.locationId!==store.locationId)
    throw new AppError('FORBIDDEN','Employee access required',403);
  const profile=await prisma.profiles.findFirst({where:{id:actor.profileId,is_active:true},
    select:{email:true,display_name:true,platform_role:true}});
  if(!profile)throw new AppError('FORBIDDEN','Employee profile inactive',403);
  const context=await resolveOrganizationContext({
    session:{id:actor.sessionId,profileId:actor.profileId,
      email:profile.email,displayName:profile.display_name,
      platformRole:profile.platform_role,expiresAt:new Date(Date.now()+60_000),csrfTokenHash:''},
    organizationSlug:store.organizationSlug,locationSlug:store.locationSlug,
  });
  if(context.organization.id!==store.organizationId || context.location?.id!==store.locationId)
    throw new AppError('FORBIDDEN','Store access mismatch',403);
  return context;
}

import BookingClient from './booking-experience';
import {headers} from 'next/headers';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {notFound} from 'next/navigation';
import {resolveMobileStore} from '@/server/mobile/store';
import {getStoreLineLoginChannel} from '@/server/notifications/line-channel-registry';
export default async function StorePage({params,searchParams}: {params:Promise<{store:string}>;searchParams:Promise<{staff?:string}>}) {
  const {store}=await params; const {staff}=await searchParams;
  const localDemo=localDemoEnabled((await headers()).get('host'));
  if (!localDemo) {
    const location=await resolveMobileStore(store).catch(()=>notFound());
    const login=await getStoreLineLoginChannel(location.organizationId,location.locationId);
    if (!login) notFound();
  }
  return <BookingClient store={store} preferredStaff={staff||''} localDemo={localDemo}/>;
}

'use client';

import { SubscriptionPage } from '@/components/plans/SubscriptionPage';
import { useRider } from '@/components/rider/RiderProvider';

export default function Page() {
  const { rider } = useRider();
  return <SubscriptionPage type="rider" subscriberId={rider.id} townId={rider.townId} />;
}

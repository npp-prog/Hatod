'use client';

import { SubscriptionPage } from '@/components/plans/SubscriptionPage';
import { useShop } from '@/components/shop/ShopProvider';

export default function Page() {
  const { shop } = useShop();
  return <SubscriptionPage type="shop" subscriberId={shop.id} townId={shop.townId} />;
}

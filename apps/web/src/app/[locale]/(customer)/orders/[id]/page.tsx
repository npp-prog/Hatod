import { use } from 'react';
import { OrderTracking } from './OrderTracking';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrderTracking orderId={decodeURIComponent(id)} />;
}

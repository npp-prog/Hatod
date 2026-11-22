import { use } from 'react';
import { ShopPage } from './ShopPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ShopPage shopId={id} />;
}

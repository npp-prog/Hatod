import { use } from 'react';
import { ListingDetail } from './ListingDetail';

export default function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  return <ListingDetail kind={kind === 'rider' ? 'rider' : 'shop'} id={decodeURIComponent(id)} />;
}

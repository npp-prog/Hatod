import { use } from 'react';
import { AddressForm } from '../AddressForm';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AddressForm id={id} />;
}

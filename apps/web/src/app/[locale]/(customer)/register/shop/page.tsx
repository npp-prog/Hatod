import { Suspense } from 'react';
import { RegisterShopForm } from './RegisterShopForm';

export default function Page() {
  return (
    <Suspense>
      <RegisterShopForm />
    </Suspense>
  );
}

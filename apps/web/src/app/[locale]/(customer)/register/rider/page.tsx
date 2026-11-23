import { Suspense } from 'react';
import { RegisterRiderForm } from './RegisterRiderForm';

export default function Page() {
  return (
    <Suspense>
      <RegisterRiderForm />
    </Suspense>
  );
}

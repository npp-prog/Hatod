import { Suspense } from 'react';
import { ItemEditor } from './ItemEditor';

export default function Page() {
  return (
    <Suspense>
      <ItemEditor />
    </Suspense>
  );
}

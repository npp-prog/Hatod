import { use } from 'react';
import { TownEditor } from './TownEditor';

export default function Page({ params }: { params: Promise<{ townId: string }> }) {
  const { townId } = use(params);
  return <TownEditor townId={decodeURIComponent(townId)} />;
}

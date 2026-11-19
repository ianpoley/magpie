import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { loadSnapshot } from "@/lib/snapshot";

// "Past week" and "synced 2 hr ago" are measured from the request that read the store.
const requestTime = (): number => Date.now();

async function Corpus() {
  const snapshot = await loadSnapshot();
  return <CorpusScreen snapshot={snapshot} now={requestTime()} />;
}

export default function Home() {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus />
    </Suspense>
  );
}

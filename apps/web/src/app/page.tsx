import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { parseLinked, type QueryValues } from "@/lib/filter-url";
import { loadSnapshot, loadSyncState } from "@/lib/snapshot";

// "Past week" and "synced 2 hr ago" are measured from the request that read the store.
const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values] = await Promise.all([loadSnapshot(), query]);
  const sync = await loadSyncState(snapshot);
  return <CorpusScreen snapshot={snapshot} sync={sync} now={requestTime()} linked={parseLinked(values)} />;
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

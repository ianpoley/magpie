import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { parseSelection, type QueryValues } from "@/lib/filter-url";
import { loadSnapshot } from "@/lib/snapshot";

// "Past week" and "synced 2 hr ago" are measured from the request that read the store.
const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values] = await Promise.all([loadSnapshot(), query]);
  return <CorpusScreen snapshot={snapshot} now={requestTime()} linked={parseSelection(values)} />;
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

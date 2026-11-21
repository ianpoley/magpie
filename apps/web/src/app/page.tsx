import { cookies } from "next/headers";
import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { LAYOUT_COOKIE, parseLayout } from "@/components/post-layout";
import { parseLinked, type QueryValues } from "@/lib/filter-url";
import { loadSnapshot, loadSyncState } from "@/lib/snapshot";

// "Past week" and "synced 2 hr ago" are measured from the request that read the store.
const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values, jar] = await Promise.all([loadSnapshot(), query, cookies()]);
  const sync = await loadSyncState(snapshot);
  return <CorpusScreen snapshot={snapshot} sync={sync} now={requestTime()} linked={parseLinked(values)} layout={parseLayout(jar.get(LAYOUT_COOKIE)?.value)} />;
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

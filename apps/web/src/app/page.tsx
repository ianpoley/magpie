import { cookies } from "next/headers";
import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { LAYOUT_COOKIE, parseLayout } from "@/components/post-layout";
import { SetupGate } from "@/components/setup-gate";
import { parseLinked, type QueryValues } from "@/lib/filter-url";
import { loadSnapshot, loadSyncState } from "@/lib/snapshot";
import { readJevKeyStored } from "@/lib/sync-state";

// "Past week" and "synced 2 hr ago" are measured from the request that read the store.
const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values, jar, jevStored] = await Promise.all([loadSnapshot(), query, cookies(), readJevKeyStored()]);
  const sync = await loadSyncState(snapshot);
  // X and a Jev key are both required; until both are saved, setup is all there is.
  if (sync.connection === "not_connected" || !jevStored) return <SetupGate sync={sync} jevStored={jevStored} />;
  return <CorpusScreen snapshot={snapshot} sync={sync} now={requestTime()} linked={parseLinked(values)} layout={parseLayout(jar.get(LAYOUT_COOKIE)?.value)} />;
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

import { cookies } from "next/headers";
import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { LAYOUT_COOKIE, parseLayout } from "@/components/post-layout";
import { SetupGate } from "@/components/setup-gate";
import { parseClosedSections, SECTIONS_COOKIE } from "@/components/sidebar-sections";
import { parseLinked, type QueryValues } from "@/lib/filter-url";
import { loadFocus } from "@/lib/settings-state";
import { loadSnapshot, loadSyncState } from "@/lib/snapshot";
import { readJevKeyStored } from "@/lib/sync-state";

const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values, jar, jevStored, focus] = await Promise.all([loadSnapshot(), query, cookies(), readJevKeyStored(), loadFocus()]);
  const sync = await loadSyncState(snapshot);
  if (sync.connection === "not_connected" || !jevStored || !focus.chosen) return <SetupGate sync={sync} jevStored={jevStored} focusChosen={focus.chosen} />;
  return (
    <CorpusScreen
      snapshot={snapshot}
      sync={sync}
      now={requestTime()}
      linked={parseLinked(values)} layout={parseLayout(jar.get(LAYOUT_COOKIE)?.value)}
      closedSections={parseClosedSections(jar.get(SECTIONS_COOKIE)?.value)}
    />
  );
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

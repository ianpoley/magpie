import { cookies } from "next/headers";
import { Suspense } from "react";

import { CorpusScreen } from "@/components/corpus-screen";
import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { RegisterDebugFlags } from "@/components/debug-flags/registry";
import { debugSetup, homeDebugFlags } from "@/components/home-debug-flags";
import { LAYOUT_COOKIE, parseLayout } from "@/components/post-layout";
import { SetupGate } from "@/components/setup-gate";
import { parseClosedSections, SECTIONS_COOKIE } from "@/components/sidebar-sections";
import { getDebugFlagValue } from "@/lib/debug-flags/server";
import { parseLinked, parseView, type QueryValues } from "@/lib/filter-url";
import { readSettings } from "@/lib/settings-state";
import { loadSnapshot, loadSyncState } from "@/lib/snapshot";

const requestTime = (): number => Date.now();

async function Corpus({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values, jar, settings] = await Promise.all([loadSnapshot(), query, cookies(), readSettings()]);
  const { sync, jevStored, focusChosen } = debugSetup(
    { sync: await loadSyncState(snapshot), jevStored: settings.jevKeyStored, focusChosen: settings.focus.chosen },
    getDebugFlagValue(values, homeDebugFlags.setup, "default"),
  );
  if (sync.connection === "not_connected" || !jevStored || !focusChosen) {
    return (
      <>
        <RegisterDebugFlags flags={homeDebugFlags} />
        <SetupGate sync={sync} jevStored={jevStored} focusChosen={focusChosen} />
      </>
    );
  }
  return (
    <>
      <RegisterDebugFlags flags={homeDebugFlags} />
      <CorpusScreen
        snapshot={snapshot}
        sync={sync}
        now={requestTime()}
        linked={parseLinked(values)}
        view={parseView(values)}
        layout={parseLayout(jar.get(LAYOUT_COOKIE)?.value)}
        closedSections={parseClosedSections(jar.get(SECTIONS_COOKIE)?.value)}
        settings={settings}
      />
    </>
  );
}

export default function Home({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Corpus query={searchParams} />
    </Suspense>
  );
}

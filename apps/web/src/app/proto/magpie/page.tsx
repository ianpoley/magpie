// Throwaway prototype route: Magpie brand directions on the full app, behind a picker. Nothing imports it.
import { Suspense } from "react";

import { CorpusSkeleton } from "@/components/corpus-skeleton";
import { parseLinked, type QueryValues } from "@/lib/filter-url";
import { loadSnapshot } from "@/lib/snapshot";

import { fontVars } from "./fonts";
import { Harness } from "./harness";

import "./proto.css";

// Measured from the request that read the store, as on the real page.
const requestTime = (): number => Date.now();

async function Load({ query }: { query: Promise<QueryValues> }) {
  const [snapshot, values] = await Promise.all([loadSnapshot(), query]);
  return <Harness snapshot={snapshot} now={requestTime()} linked={parseLinked(values)} fontVars={fontVars} />;
}

export default function MagpieProto({ searchParams }: { searchParams: Promise<QueryValues> }) {
  return (
    <Suspense fallback={<CorpusSkeleton />}>
      <Load query={searchParams} />
    </Suspense>
  );
}

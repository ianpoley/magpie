const BAR = "animate-pulse rounded-full bg-sunken motion-reduce:animate-none";

/** The screen's outline while the corpus loads. */
export function CorpusSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Loading your saved posts">
      <div className="bg-side sticky top-0 hidden h-dvh w-[272px] shrink-0 lg:block" />
      <div className="bg-wash min-w-0 flex-1">
        <div className="mx-auto flex max-w-[800px] flex-col gap-5 px-4 pt-4 pb-24 sm:px-8 lg:pt-10">
          <div className="flex flex-col gap-3">
            <div className={`${BAR} h-3 w-28`} />
            <div className={`${BAR} h-9 w-56`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((tile) => (
              <div key={tile} className="h-[64px] animate-pulse rounded-card bg-surface shadow-card motion-reduce:animate-none" />
            ))}
          </div>
          <div className="h-10 rounded-full bg-surface shadow-card" />
          {[0, 1, 2].map((card) => (
            <div key={card} className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
              <div className="flex items-center gap-3">
                <div className="size-10 animate-pulse rounded-avatar bg-sunken motion-reduce:animate-none" />
                <div className="flex flex-col gap-2">
                  <div className={`${BAR} h-3 w-36`} />
                  <div className={`${BAR} h-2.5 w-24`} />
                </div>
              </div>
              <div className={`${BAR} h-3 w-full`} />
              <div className={`${BAR} h-3 w-4/5`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

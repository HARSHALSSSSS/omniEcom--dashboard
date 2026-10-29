export function ListingsSkeleton() {
  return (
    <div className="w-full flex flex-col items-start gap-4 font-['Inter',sans-serif] text-[#000000] pb-24 animate-pulse">
      {/* =========================================================================
          1. PAGE HEADER SKELETON
         ========================================================================= */}
      {/* =========================================================================
          1. PAGE HEADER SKELETON
         ========================================================================= */}
      <header className="w-full flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 py-1">
        <div className="flex flex-col items-start gap-2">
          {/* Eyebrow */}
          <div className="w-16 h-2 bg-[#E5E7EB] rounded" />
          {/* Title */}
          <div className="w-44 h-7 bg-[#E5E7EB] rounded-md" />
          {/* Subtitle */}
          <div className="w-[450px] max-w-full h-3 bg-[#E5E7EB] rounded" />
        </div>

        {/* Top Action Buttons Skeleton */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-28 h-9 rounded-lg bg-[#E5E7EB]" />
          <div className="w-32 h-9 rounded-lg bg-[#E5E7EB]" />
        </div>
      </header>

      {/* =========================================================================
          2. CATALOG REACH / METRICS SKELETON
         ========================================================================= */}
      <section className="w-full space-y-2 pt-2">
        <div className="w-full flex flex-row items-center py-4 border-y border-[#EAEAEA] gap-4 sm:gap-8 overflow-x-auto scrollbar-none">
          {/* Metric 1 */}
          <div className="flex flex-col items-start gap-2 min-w-[120px] shrink-0">
            <div className="w-24 h-5 bg-[#E5E7EB] rounded" />
            <div className="w-28 h-2.5 bg-[#E5E7EB] rounded" />
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA] shrink-0" />

          {/* Metric 2 */}
          <div className="flex flex-col items-start gap-2 min-w-[100px] shrink-0">
            <div className="w-16 h-5 bg-[#E5E7EB] rounded" />
            <div className="w-24 h-2.5 bg-[#E5E7EB] rounded" />
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA] shrink-0" />

          {/* Metric 3 */}
          <div className="flex flex-col items-start gap-2 min-w-[100px] shrink-0">
            <div className="w-12 h-5 bg-[#E5E7EB] rounded" />
            <div className="w-24 h-2.5 bg-[#E5E7EB] rounded" />
          </div>

          <div className="w-[1px] h-9 bg-[#EAEAEA] shrink-0" />

          {/* Metric 4 */}
          <div className="flex flex-col items-start gap-2 min-w-[100px] shrink-0">
            <div className="w-16 h-5 bg-[#E5E7EB] rounded" />
            <div className="w-24 h-2.5 bg-[#E5E7EB] rounded" />
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. STATUS FILTER PILLS SKELETON
         ========================================================================= */}
      <div className="w-full flex flex-row items-center gap-4 sm:gap-6 py-2.5 border-b border-[#EAEAEA] overflow-x-auto scrollbar-none">
        <div className="w-10 h-3 bg-[#E5E7EB] rounded shrink-0" />
        <div className="w-16 h-3 bg-[#E5E7EB] rounded shrink-0" />
        <div className="w-16 h-3 bg-[#E5E7EB] rounded shrink-0" />
        <div className="w-20 h-3 bg-[#E5E7EB] rounded shrink-0" />
        <div className="w-16 h-3 bg-[#E5E7EB] rounded shrink-0" />
      </div>

      {/* =========================================================================
          4. TABLE SKELETON
         ========================================================================= */}
      <div className="w-full border border-[#EAEAEA] rounded-md overflow-x-auto bg-white mt-1">
        <div className="min-w-[700px]">
          {/* Table Header */}
          <div className="h-10 bg-[#F5F5F5] px-4 flex items-center gap-6 border-b border-[#EAEAEA]">
            <div className="w-3.5 h-3.5 rounded bg-[#D1D5DB] shrink-0" />
            <div className="w-36 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-24 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-20 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-16 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-20 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-20 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-24 h-2.5 bg-[#D1D5DB] rounded shrink-0" />
            <div className="w-16 h-2.5 bg-[#D1D5DB] rounded ml-auto shrink-0" />
          </div>

          {/* Table Rows (6 rows matching screenshot) */}
          <div className="divide-y divide-[#EAEAEA]">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-11 px-4 flex items-center gap-6">
                <div className="w-3.5 h-3.5 rounded bg-[#E5E7EB] shrink-0" />
                <div className="w-36 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-24 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-16 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-24 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
                <div className="w-16 h-2.5 bg-[#E5E7EB] rounded ml-auto shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. BOTTOM ANNOTATION
         ========================================================================= */}
      <p className="text-[12px] font-normal text-[#666666] pt-3">
        Skeleton matrix, readiness visualization, and table rows load in parallel.
      </p>
    </div>
  );
}

export function ListingTableRowsSkeleton() {
  return (
    <div className="divide-y divide-[#EAEAEA] animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-11 px-4 flex items-center gap-6">
          <div className="w-3.5 h-3.5 rounded bg-[#E5E7EB] shrink-0" />
          <div className="w-36 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-24 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-16 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-20 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-24 h-2.5 bg-[#E5E7EB] rounded shrink-0" />
          <div className="w-16 h-2.5 bg-[#E5E7EB] rounded ml-auto shrink-0" />
        </div>
      ))}
    </div>
  );
}

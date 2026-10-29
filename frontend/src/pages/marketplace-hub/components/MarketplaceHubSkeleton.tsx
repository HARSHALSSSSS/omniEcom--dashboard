import React from "react";

export const MarketplaceHubSkeleton: React.FC = () => {
  return (
    <div className="w-full space-y-6 font-['Inter',sans-serif] animate-pulse">
      {/* "Your commerce network" Skeleton */}
      <div className="space-y-3">
        <div className="text-[12px] font-semibold text-black">
          Your commerce network
        </div>

        <div className="w-full flex flex-col md:flex-row items-stretch md:items-center gap-4">
          {/* Master Catalog Box */}
          <div className="w-full md:w-[200px] shrink-0 rounded-xl bg-[#F5F5F5] border border-[#EAEAEA] p-4 flex flex-col justify-center space-y-2">
            <div className="h-3.5 w-24 bg-[#E2E2E2] rounded-md" />
            <div className="h-2.5 w-28 bg-[#EAEAEA] rounded-md" />
            <div className="h-2.5 w-16 bg-[#EAEAEA] rounded-md" />
          </div>

          {/* 6 Network Nodes */}
          <div className="flex-1 min-w-0 grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="p-3.5 rounded-lg border border-[#EAEAEA] bg-white flex flex-col justify-center space-y-2.5"
              >
                <div className="h-3 w-16 bg-[#E2E2E2] rounded-md" />
                <div className="h-2.5 w-20 bg-[#EAEAEA] rounded-md" />
                <div className="h-2.5 w-14 bg-[#EAEAEA] rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Counters Skeleton */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <div className="h-3.5 w-20 bg-[#E2E2E2] rounded-full" />
        <div className="h-3.5 w-16 bg-[#EAEAEA] rounded-full" />
        <div className="h-3.5 w-24 bg-[#EAEAEA] rounded-full" />
        <div className="h-3.5 w-20 bg-[#EAEAEA] rounded-full" />
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex items-center gap-3 pt-1 overflow-x-auto max-w-full pb-1">
        <div className="shrink-0 h-6 w-10 bg-[#E2E2E2] rounded-md" />
        <div className="shrink-0 h-6 w-16 bg-[#EAEAEA] rounded-md" />
        <div className="shrink-0 h-6 w-20 bg-[#EAEAEA] rounded-md" />
        <div className="shrink-0 h-6 w-20 bg-[#EAEAEA] rounded-md" />
        <div className="shrink-0 h-6 w-14 bg-[#EAEAEA] rounded-md" />
      </div>

      {/* Search Input Skeleton with border frame */}
      <div className="w-full h-10 px-4 rounded-lg border border-[#EAEAEA] bg-white flex items-center">
        <div className="h-3.5 w-44 bg-[#EAEAEA] rounded-md" />
      </div>

      {/* 7-Column Table Skeleton */}
      <div className="w-full border border-[#EAEAEA] rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-6 py-3 bg-[#FAFAFA] border-b border-[#EAEAEA] text-[11px] font-medium text-[#737373]">
              <div className="col-span-3">Channel</div>
              <div className="col-span-1">Connection</div>
              <div className="col-span-2">Catalog</div>
              <div className="col-span-1">Orders</div>
              <div className="col-span-1">Inventory</div>
              <div className="col-span-2">Sync</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* 6 Skeleton Rows */}
            <div className="divide-y divide-[#EAEAEA]">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 px-6 py-4.5 items-center"
                >
                  <div className="col-span-3">
                    <div className="h-3.5 w-20 bg-[#E2E2E2] rounded-md" />
                  </div>
                  <div className="col-span-1">
                    <div className="h-3 w-16 bg-[#EAEAEA] rounded-md" />
                  </div>
                  <div className="col-span-2">
                    <div className="h-3 w-20 bg-[#EAEAEA] rounded-md" />
                  </div>
                  <div className="col-span-1">
                    <div className="h-3 w-14 bg-[#EAEAEA] rounded-md" />
                  </div>
                  <div className="col-span-1">
                    <div className="h-3 w-12 bg-[#EAEAEA] rounded-md" />
                  </div>
                  <div className="col-span-2">
                    <div className="h-3 w-24 bg-[#EAEAEA] rounded-md" />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <div className="h-3 w-14 bg-[#EAEAEA] rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Loading Indicator Caption */}
      <div className="text-[12px] text-[#666666] pt-1">
        Loading channel connections and recent synchronization activity...
      </div>
    </div>
  );
};

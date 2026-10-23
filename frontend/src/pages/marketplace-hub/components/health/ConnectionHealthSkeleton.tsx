export function ConnectionHealthSkeleton() {
  return (
    <div className="w-full space-y-8 pb-24 text-[#111111] animate-in fade-in duration-200">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 bg-[#EAEAEA] rounded animate-pulse" />
          <div className="h-8 w-64 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-4 w-96 max-w-full bg-[#EDEDED] rounded animate-pulse" />
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <span className="text-[12px] text-[#8A8A8A]">Checking connections...</span>
          <div className="h-9 w-28 bg-[#E5E5E5] rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Network Pulse Skeleton */}
      <div className="rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
            NETWORK PULSE
          </span>
          <span className="text-[12px] text-[#8A8A8A]">Reading your network...</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-8">
          <div className="space-y-2 w-48">
            <div className="h-10 w-32 bg-[#E5E5E5] rounded animate-pulse" />
            <div className="h-3 w-40 bg-[#EDEDED] rounded animate-pulse" />
            <div className="h-3 w-36 bg-[#EDEDED] rounded animate-pulse" />
          </div>
          <div className="flex-1 h-12 bg-[#F9F9FA] rounded-xl border border-[#F0F0F0] p-4 flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#E5E5E5] animate-pulse" />
                <div className="h-3 w-16 bg-[#EDEDED] rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connection Field & Network Friction Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
          <div className="h-4 w-32 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-48 bg-[#FAFAFA] rounded-xl border border-[#EDEDED] p-6 flex flex-col justify-around">
            <div className="h-4 w-3/4 bg-[#EAEAEA] rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-[#EAEAEA] rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-[#EAEAEA] rounded animate-pulse" />
          </div>
        </div>
        <div className="rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
          <div className="h-4 w-28 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-48 bg-[#FAFAFA] rounded-xl border border-[#EDEDED] p-4 space-y-3">
            <div className="h-4 w-full bg-[#EAEAEA] rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-[#EDEDED] rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-[#EDEDED] rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* What is at risk Skeleton */}
      <div className="rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-3">
        <div className="h-3 w-28 bg-[#E5E5E5] rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-8 w-16 bg-[#E5E5E5] rounded animate-pulse" />
              <div className="h-3 w-40 bg-[#EDEDED] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Data Flow Skeleton */}
      <div className="rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-[#E5E5E5] rounded animate-pulse" />
          <div className="h-3 w-36 bg-[#EDEDED] rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="h-3 w-20 bg-[#E5E5E5] rounded animate-pulse" />
              <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full animate-pulse" />
              <div className="h-3 w-24 bg-[#EDEDED] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* DNA Skeletons */}
      <div className="rounded-xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
        <div className="h-3 w-36 bg-[#E5E5E5] rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-[#EDEDED] rounded animate-pulse" />
              <div className="h-2 w-full bg-[#E5E5E5] rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";
import { AttentionAndDecision } from "@/components/dashboard/AttentionAndDecision";
import { BusinessSnapshot } from "@/components/dashboard/BusinessSnapshot";
import { SalesPerformanceSection } from "@/components/dashboard/SalesPerformanceSection";
import { OrderFlowSection } from "@/components/dashboard/OrderFlowSection";
import { InventoryAndChannelsSection } from "@/components/dashboard/InventoryAndChannelsSection";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { DEFAULT_PERIOD } from "@/constants/dashboard.data";
import { useCan, useFeature } from "@/hooks/useCan";
import { useDashboard, useDismissRecommendation } from "@/hooks/useDashboard";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { SalesPeriod } from "@/types/dashboard";

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <Skeleton className="h-[330px] flex-1 rounded-[12px]" />
        <Skeleton className="h-[330px] w-full lg:w-[368px] rounded-[12px]" />
      </div>
      <Skeleton className="h-[123px] w-full rounded-[12px]" />
      <Skeleton className="h-[480px] w-full rounded-[12px]" />
      <Skeleton className="h-[160px] w-full rounded-[12px]" />
      <div className="flex flex-col lg:flex-row gap-6">
        <Skeleton className="h-[420px] flex-1 rounded-[12px]" />
        <Skeleton className="h-[420px] w-full lg:w-[476px] rounded-[12px]" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<SalesPeriod>(DEFAULT_PERIOD);
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData } = useDashboard(period);
  const dismiss = useDismissRecommendation();
  const timeZone = useWorkspaceStore((s) => s.shell?.business.timezone);
  const canUseAi = useCan("ai:use");
  const aiEnabled = useFeature("ai.enabled");

  if (isPending) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="flex w-full min-h-[60vh] items-center justify-center p-4">
        <div
          role="alert"
          className="flex flex-col items-center justify-center text-center gap-3 w-full max-w-[520px] bg-white border border-[#EAEAEA] rounded-[16px] p-8 shadow-xs"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#EF4444] mb-1">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-[18px] font-semibold leading-[145%] text-[#000000]">We couldn&apos;t load your dashboard</h1>
          <p className="text-[13px] text-[#666666] leading-[150%] max-w-[420px]">{errorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#000000] px-5 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  const recommendation = canUseAi && aiEnabled ? data.recommendation : null;

  return (
    <div className="flex flex-col gap-8 w-full select-none">
      <DashboardIntro firstName={data.greeting.firstName} timeZone={timeZone} asOf={data.asOf} />

      <AttentionAndDecision
        items={data.needsAttention?.items}
        recommendation={recommendation}
        dismissing={dismiss.isPending}
        dismissError={dismiss.isError ? errorMessage(dismiss.error, "Could not dismiss the recommendation.") : null}
        onDismissRecommendation={(id) => dismiss.mutate(id)}
      />

      <BusinessSnapshot metrics={data.snapshot.metrics} />

      <SalesPerformanceSection
        sales={data.sales}
        period={period}
        onPeriodChange={setPeriod}
        refreshing={isPlaceholderData}
      />

      {data.orderFlow && <OrderFlowSection stages={data.orderFlow} />}

      <InventoryAndChannelsSection inventory={data.inventoryHealth} channels={data.channelHealth} />

      {data.sync && <DashboardFooter sync={data.sync} />}
    </div>
  );
}

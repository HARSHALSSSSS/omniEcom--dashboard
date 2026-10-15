import { useState } from "react";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";
import { AttentionAndDecision } from "@/components/dashboard/AttentionAndDecision";
import { BusinessSnapshot } from "@/components/dashboard/BusinessSnapshot";
import { SalesPerformanceSection } from "@/components/dashboard/SalesPerformanceSection";
import { OrderFlowSection } from "@/components/dashboard/OrderFlowSection";
import { InventoryAndChannelsSection } from "@/components/dashboard/InventoryAndChannelsSection";
import { DashboardFooter } from "@/components/dashboard/DashboardFooter";

import {
  NEEDS_ATTENTION_ITEMS,
  BUSINESS_METRICS,
  SALES_HISTORY_DATA,
  CHANNEL_CONTRIBUTION_DATA,
  ORDER_PIPELINE_STAGES,
  AFFECTED_PRODUCTS,
  CHANNEL_HEALTH_ITEMS,
} from "@/constants/dashboard.data";

export default function DashboardPage() {
  const [recommendationDismissed, setRecommendationDismissed] = useState(false);

  const handleReviewRecommendation = () => {
    // Navigate or alert for recommendation review
    window.location.href = "/inventory?filter=low_stock";
  };

  const handleDismissRecommendation = () => {
    setRecommendationDismissed(true);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1136px] mx-auto select-none">
      {/* 1. Intro & Greeting */}
      <DashboardIntro
        userName="Abhishek"
        dateLabel="Today · Oct 5, 2026"
      />

      {/* 2. Attention and Decision */}
      {!recommendationDismissed ? (
        <AttentionAndDecision
          items={NEEDS_ATTENTION_ITEMS}
          onReviewRecommendation={handleReviewRecommendation}
          onDismissRecommendation={handleDismissRecommendation}
        />
      ) : (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <AttentionAndDecision
            items={NEEDS_ATTENTION_ITEMS}
            onReviewRecommendation={handleReviewRecommendation}
            onDismissRecommendation={handleDismissRecommendation}
          />
        </div>
      )}

      {/* 3. Business Snapshot */}
      <BusinessSnapshot metrics={BUSINESS_METRICS} />

      {/* 4. Sales Performance */}
      <SalesPerformanceSection
        history={SALES_HISTORY_DATA}
        channels={CHANNEL_CONTRIBUTION_DATA}
      />

      {/* 5. Order Flow */}
      <OrderFlowSection stages={ORDER_PIPELINE_STAGES} />

      {/* 6. Inventory & Channels */}
      <InventoryAndChannelsSection
        products={AFFECTED_PRODUCTS}
        channels={CHANNEL_HEALTH_ITEMS}
      />

      {/* 7. Bottom Sync & Status Utility */}
      <DashboardFooter
        lastSyncedText="Last synced 2 minutes ago"
        systemStatusText="All systems operational"
      />
    </div>
  );
}

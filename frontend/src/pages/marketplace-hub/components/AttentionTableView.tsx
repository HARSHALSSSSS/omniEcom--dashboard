import React from "react";
import { ChannelConnection } from "@/types/connection";

interface AttentionTableViewProps {
  connections: ChannelConnection[];
  onReconnect: (channelId: string) => void;
  onViewDetails: (channelId: string) => void;
}

export const AttentionTableView: React.FC<AttentionTableViewProps> = ({
  connections,
  onReconnect,
  onViewDetails,
}) => {
  // Extract items that have an attention issue
  const attentionItems = connections.filter(
    (c) => c.status === "warning" || c.attentionIssue !== undefined,
  );

  return (
    <div className="w-full space-y-6">
      {/* Table */}
      <div className="w-full border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
        {/* Table Header */}
        <div className="grid grid-cols-12 px-6 py-3 bg-white border-b border-[#E5E5E5] text-[11px] font-medium text-[#737373]">
          <div className="col-span-3">Channel</div>
          <div className="col-span-7">Connection health and affected areas</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-[#E5E5E5]">
          {attentionItems.map((item) => {
            const issue = item.attentionIssue || {
              issueTitle: "Sync delayed",
              issueDescription: "The next inventory update is waiting to synchronize.",
              affectedAreas: ["Inventory"],
              lastSuccessfulSync: "18 min ago",
              actionType: "retry_scheduled",
            };

            const isActionRequired = issue.actionType === "reconnect";

            return (
              <div
                key={item.id}
                className="grid grid-cols-12 px-6 py-5 items-start hover:bg-[#FAFAFA] transition-colors"
              >
                {/* Channel Name & Status tag */}
                <div className="col-span-3 space-y-1">
                  <div className="text-[13px] font-semibold text-[#121212]">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                    {isActionRequired ? (
                      <>
                        <span>!</span>
                        <span>Action required</span>
                      </>
                    ) : (
                      <>
                        <span>⏱</span>
                        <span>Sync delayed</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Issue Details & Affected Areas */}
                <div className="col-span-7 space-y-1.5 pr-4">
                  <div className="text-[13px] font-semibold text-[#121212]">
                    {issue.issueTitle}
                  </div>
                  <div className="text-[12px] text-[#737373]">
                    {issue.issueDescription}
                  </div>
                  <div className="text-[11px] text-[#737373]">
                    Last successful sync {issue.lastSuccessfulSync}
                  </div>
                  <div className="text-[11px] font-medium text-[#121212] pt-0.5">
                    Affected {issue.affectedAreas.join(" · ")}
                  </div>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex flex-col items-end gap-2">
                  {issue.actionType === "reconnect" ? (
                    <button
                      type="button"
                      onClick={() => onReconnect(item.id)}
                      className="h-8 px-4 rounded-lg bg-[#121212] text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      Reconnect
                    </button>
                  ) : (
                    <span className="text-[12px] text-[#737373] py-1 font-normal">
                      Retry scheduled
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onViewDetails(item.id)}
                    className="text-[12px] font-medium text-[#121212] hover:underline cursor-pointer"
                  >
                    {issue.actionType === "reconnect" && item.name === "Shopify"
                      ? "Learn more →"
                      : "View details →"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contextual Advisory Info Box */}
      <div className="w-full rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] p-5 space-y-1">
        <div className="text-[12px] font-semibold text-[#121212]">
          Different issues need different actions.
        </div>
        <p className="text-[12px] text-[#737373] leading-relaxed">
          Renew authorization when a connection expires. A delayed sync is not a failure;
          Meesho will retry automatically. Historical workspace data remains available.
        </p>
      </div>
    </div>
  );
};

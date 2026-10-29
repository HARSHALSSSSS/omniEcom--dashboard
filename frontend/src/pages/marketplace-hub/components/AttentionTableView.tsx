import React from "react";
import type { ChannelConnection } from "@/types/connection";
import { ago } from "@/components/marketplace-hub/accounts/hubFormat";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { channelStatus, needsAttention } from "./channelRows";

interface AttentionTableViewProps {
  connections: ChannelConnection[];
  onViewDetails: (channelId: string) => void;
}

function AttentionRow({ item, onViewDetails }: { item: ChannelConnection; onViewDetails: (id: string) => void }) {
  const account = item.account!;
  const a = useAccountActions(account);
  const issue = item.attentionIssue;
  const needsReconnect = account.accountStatus !== "active" && account.accountStatus !== "paused";
  const extra = item.health.frictionPoints.slice(1);

  return (
    <div className="grid grid-cols-12 px-6 py-5 items-start hover:bg-[#FAFAFA] transition-colors">
      <div className="col-span-3 space-y-1">
        <div className="text-[13px] font-semibold text-[#121212]">{item.name}</div>
        <div className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
          <span>!</span>
          <span>{needsReconnect ? "Action required" : "Needs attention"}</span>
        </div>
      </div>

      <div className="col-span-7 space-y-1.5 pr-4">
        <div className="text-[13px] font-semibold text-[#121212]">{issue?.issueTitle ?? "Needs attention"}</div>
        {extra.length > 0 && (
          <ul className="list-disc list-inside text-[12px] text-[#737373] space-y-0.5">
            {extra.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <div className="text-[11px] text-[#737373]">
          Last successful sync {item.lastSyncAt && item.lastSyncAt !== "Never" ? ago(item.lastSyncAt) : "never"}
        </div>
      </div>

      <div className="col-span-2 flex flex-col items-end gap-2">
        {needsReconnect ? (
          <button
            type="button"
            disabled={!a.canWrite}
            title={a.canWrite ? undefined : "Your role cannot change marketplace connections."}
            onClick={() => a.openDialog("reconnect")}
            className="h-9 sm:h-8 px-4 rounded-lg bg-[#121212] text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={Boolean(a.syncReason) || a.syncing}
            title={a.syncReason ?? undefined}
            onClick={a.startSync}
            className="h-9 sm:h-8 px-4 rounded-lg border border-[#BDBDBD] text-[12px] font-semibold text-[#121212] hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Retry sync
          </button>
        )}
        <button type="button" onClick={() => onViewDetails(item.id)} className="text-[12px] font-medium text-[#121212] hover:underline cursor-pointer py-1 sm:py-0">
          View details →
        </button>
      </div>
      {a.dialogs}
    </div>
  );
}

export const AttentionTableView: React.FC<AttentionTableViewProps> = ({ connections, onViewDetails }) => {
  const attentionItems = connections.filter((c) => c.account && needsAttention(channelStatus(c)));

  return (
    <div className="w-full space-y-6">
      <div className="w-full border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[720px] md:min-w-0">
            <div className="grid grid-cols-12 px-6 py-3 bg-white border-b border-[#E5E5E5] text-[11px] font-medium text-[#737373]">
              <div className="col-span-3">Channel</div>
              <div className="col-span-7">Connection health</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-[#E5E5E5]">
              {attentionItems.length === 0 && <div className="px-6 py-10 text-center text-[13px] text-[#737373]">No connection needs attention.</div>}
              {attentionItems.map((item) => (
                <AttentionRow key={item.id} item={item} onViewDetails={onViewDetails} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] p-5 space-y-1">
        <div className="text-[12px] font-semibold text-[#121212]">Different issues need different actions.</div>
        <p className="text-[12px] text-[#737373] leading-relaxed">
          Reconnect when an authorization has expired or the account was disconnected. A failed sync run can be retried. Historical workspace data remains available.
        </p>
      </div>
    </div>
  );
};

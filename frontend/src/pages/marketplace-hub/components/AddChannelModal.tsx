import React from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useConnectorDirectory } from "@/hooks/useConnectors";

export interface AddChannelOption {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  unavailableReason?: string | null;
  actionText?: string;
}

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (channelId: string) => void;
  onBrowseAll: () => void;
  channels?: AddChannelOption[];
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  onBrowseAll,
  channels: propChannels,
}) => {
  const { data: directory = [], isPending, isError } = useConnectorDirectory();

  const channelOptions: AddChannelOption[] =
    propChannels ||
    directory.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.category === "storefront" ? "Commerce platform" : d.category === "shipping" ? "Logistics network" : "Marketplace",
      connected: d.status === "connected",
      unavailableReason: d.status === "unavailable" ? (d.statusReason ?? "Not available yet") : null,
      actionText: "Connect",
    }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[580px] p-0 bg-white border border-[#EAEAEA] rounded-[24px] overflow-hidden shadow-2xl gap-0 font-['Inter',sans-serif] [&>button]:right-6 [&>button]:top-6 [&>button]:text-[#555555] [&>button]:hover:text-black">
        {/* Header */}
        <DialogHeader className="px-8 pt-7 pb-5 border-b border-[#EAEAEA] text-left">
          <DialogTitle className="text-[22px] font-semibold text-black tracking-tight leading-snug">
            Add a sales channel
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#555555] font-normal mt-1 leading-[18px]">
            Connect another marketplace or commerce platform to your business.
          </DialogDescription>
        </DialogHeader>

        {/* Channels List */}
        <div className="divide-y divide-[#EAEAEA] max-h-[380px] overflow-y-auto">
          {isPending && !propChannels && <div className="px-8 py-6 text-[13px] text-[#666666]">Loading connectors...</div>}
          {isError && !propChannels && <div role="alert" className="px-8 py-6 text-[13px] text-red-600">The connector list could not be loaded.</div>}
          {channelOptions.map((ch) => (
            <div
              key={ch.id}
              className="px-8 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
            >
              <div className="space-y-0.5 pr-4">
                <div className="text-[14px] font-semibold text-black">
                  {ch.name}
                </div>
                <div className="text-[12px] text-[#666666]">
                  {ch.unavailableReason ?? ch.type}
                </div>
              </div>

              <div className="shrink-0">
                {ch.unavailableReason ? (
                  <span className="text-[12px] text-[#737373]">Not available</span>
                ) : ch.connected ? (
                  <div className="flex items-center gap-1.5 text-[13px] text-[#374151] font-normal">
                    <Check className="w-4 h-4 stroke-[2.2] text-[#374151]" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onConnect(ch.id);
                      onClose();
                    }}
                    className="h-9 px-6 rounded-xl border border-[#1F2937] text-[13px] font-semibold text-black hover:bg-neutral-100 transition-colors cursor-pointer"
                  >
                    {ch.actionText || "Connect"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-8 pt-5 pb-7 border-t border-[#EAEAEA] space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onBrowseAll();
            }}
            className="text-[13px] font-semibold text-black hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Browse all connectors</span>
            <span className="text-[14px]">→</span>
          </button>
          <p className="text-[12px] text-[#666666] leading-relaxed">
            Explore connector availability and requirements before connecting.
            Nothing is activated automatically.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

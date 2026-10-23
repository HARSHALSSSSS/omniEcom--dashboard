import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface DisconnectChannelModalProps {
  channelName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
}

export const DisconnectChannelModal: React.FC<DisconnectChannelModalProps> = ({
  channelName,
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[460px] p-6 bg-white border border-[#E5E5E5] rounded-2xl space-y-5 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#121212]">
            Disconnect {channelName}?
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#737373] leading-relaxed">
            Your historical product, order and activity data will remain in this
            workspace. Active synchronization with {channelName} will stop.
          </DialogDescription>
        </DialogHeader>

        {/* Affected Areas Box */}
        <div className="p-4 rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] space-y-1">
          <div className="text-[11px] font-medium text-[#737373]">
            Affected areas
          </div>
          <div className="text-[12px] font-semibold text-[#121212]">
            Products · Inventory · Orders · Listings
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-9 px-5 rounded-lg border border-[#BDBDBD] text-[12px] font-semibold text-[#121212] hover:bg-[#FAFAFA] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="h-9 px-5 rounded-lg bg-[#121212] text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {isPending ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState } from "react";
import { isApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { rupeesText, parseRupees } from "@/components/listings/studio/form";
import { useSetFeeProfile } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import type { ChannelMargin } from "@/types/pricing";
import { NO_WRITE_REASON, parsePercentToBps, percentText } from "../pricingFormat";

interface ChannelFeesDialogProps {
  /** the channel being edited; null = closed */
  channel: ChannelMargin | null;
  /** pricing:write (the API's own permission for fee profiles) */
  canWrite: boolean;
  onClose: () => void;
}

const MAX_FIXED_MINOR = 100_000_000;

/** commission % and fixed fee per unit of one channel: they decide every margin the pricing screen shows */
export function ChannelFeesDialog({ channel, canWrite, onClose }: ChannelFeesDialogProps) {
  const save = useSetFeeProfile();
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) return;
    setPercent(channel.feePercentBps === null ? "" : percentText(channel.feePercentBps));
    setFixed(channel.fixedFeeMinor === null ? "" : rupeesText(channel.fixedFeeMinor));
    setFormError(null);
  }, [channel]);

  const bps = percent.trim() === "" ? null : parsePercentToBps(percent);
  const fixedMinor = fixed.trim() === "" ? 0 : parseRupees(fixed);
  const percentError = percent.trim() === "" ? "Enter the commission, 0 if there is none" : bps === null ? "A percentage from 0 to 100 with at most 2 decimals" : null;
  const fixedError = fixedMinor === null ? "An amount in rupees with at most 2 decimals" : fixedMinor > MAX_FIXED_MINOR ? "That fixed fee is too large" : null;
  const [touched, setTouched] = useState(false);
  useEffect(() => setTouched(false), [channel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!channel || !canWrite || percentError || fixedError || bps === null || fixedMinor === null) return;
    setFormError(null);
    save.mutate(
      { accountId: channel.accountId, feePercentBps: bps, fixedFeeMinor: fixedMinor },
      {
        onSuccess: () => {
          toast({ title: "Channel fees saved", description: `${channel.channel}: margins now use these fees.` });
          onClose();
        },
        onError: (err) => setFormError(isApiError(err) ? err.message : "Could not save the fees. Please try again."),
      },
    );
  };

  return (
    <Dialog open={channel !== null} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Channel fees{channel ? ` · ${channel.channel}` : ""}</DialogTitle>
            <DialogDescription>
              What this channel charges per sale. Margins on the pricing screen are the price minus your cost and these fees.
            </DialogDescription>
          </DialogHeader>

          <label className="block space-y-1 text-xs font-semibold">
            Commission (% of the price)
            <Input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} disabled={!canWrite || save.isPending} placeholder="e.g. 12" />
            {touched && percentError && (
              <span role="alert" className="block text-[11px] font-normal text-destructive">
                {percentError}
              </span>
            )}
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Fixed fee per unit (₹)
            <Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} disabled={!canWrite || save.isPending} placeholder="0" />
            {touched && fixedError && (
              <span role="alert" className="block text-[11px] font-normal text-destructive">
                {fixedError}
              </span>
            )}
          </label>

          {!canWrite && <p className="text-[11px] text-muted-foreground">{NO_WRITE_REASON}.</p>}
          {formError && (
            <p role="alert" className="text-xs text-destructive">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs" loading={save.isPending} disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON}>
              Save fees
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

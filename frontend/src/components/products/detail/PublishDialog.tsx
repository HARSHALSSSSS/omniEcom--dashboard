import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROUTES } from "@/constants/routes";
import { toast } from "@/hooks/useToast";
import { useMarketplaceAccounts, usePublishProduct, usePublishVariants } from "@/hooks/useProductDetail";

/**
 * Publish = create the channel listings (POST /listings, one per active variant) on a connected channel account.
 * The listing studio (/listings/:id) completes and sends them.
 */
export function PublishDialog({ productId, open, onOpenChange }: { productId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const accounts = useMarketplaceAccounts(open);
  const variants = usePublishVariants(productId, open);
  const publish = usePublishProduct(productId);
  const [chosen, setChosen] = useState("");

  const list = accounts.data ?? [];
  const accountId = chosen || list[0]?.id || "";
  const items = variants.data?.items ?? [];
  const ready = !!accountId && items.length > 0 && !publish.isPending;

  const submit = () => {
    publish.mutate(
      { marketplaceAccountId: accountId, variantIds: items.map((v) => v.id) },
      {
        onSuccess: ({ created, failed }) => {
          onOpenChange(false);
          if (failed.length > 0) {
            toast({
              title: `${created.length} listing${created.length === 1 ? "" : "s"} created`,
              description: `${failed.length} variant${failed.length === 1 ? "" : "s"} could not be listed: ${errorMessage(failed[0]?.error)}`,
              variant: "warning",
            });
          } else {
            toast({ title: "Listings created", description: "Review each listing and publish it from the listing studio.", variant: "success" });
          }
          const only = created.length === 1 ? created[0] : undefined;
          if (only) navigate(`${ROUTES.LISTINGS}/${only.id}`);
          else navigate(`${ROUTES.PRODUCTS}/${productId}?tab=listings`);
        },
        onError: (e) => toast({ title: "Could not create the listings", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish product</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            Choose the channel to list this product on. A listing is created for each active variant, then you review it in the listing studio.
          </DialogDescription>
        </DialogHeader>

        {accounts.isLoading || variants.isLoading ? (
          <p role="status" className="text-[12px] text-[#666666]">
            Loading channels...
          </p>
        ) : accounts.isError || variants.isError ? (
          <p role="alert" className="text-[12px] text-[#B42318]">
            {errorMessage(accounts.error ?? variants.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="text-[12px] text-[#666666]">No connected sales channel yet. Connect a marketplace first, then publish.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-[#666666]" htmlFor="publish-channel">
              Sales channel
              <select
                id="publish-channel"
                value={accountId}
                onChange={(e) => setChosen(e.target.value)}
                className="h-9 rounded-[8px] border border-[#EAEAEA] bg-white px-3 text-[12px] text-[#000000]"
              >
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[12px] text-[#000000]">
              {items.length === 0
                ? "This product has no active variant to list."
                : `${items.length} active variant${items.length === 1 ? "" : "s"} will get a listing${(variants.data?.total ?? 0) > 100 ? " (the first 100)" : ""}.`}
            </p>
          </div>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={publish.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={publish.isPending} disabled={!ready} onClick={submit}>
            Create listings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

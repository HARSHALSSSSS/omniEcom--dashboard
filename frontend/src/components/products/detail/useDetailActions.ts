import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useArchiveProduct, useDuplicateProduct, useExportProduct } from "@/hooks/useProductDetail";
import { ROUTES } from "@/constants/routes";
import type { ProductOverview } from "@/types/productDetail";
import { NO_PERMISSION, disabledReasonText, exportFileName, findAction } from "./format";

export interface ActionState {
  enabled: boolean;
  /** shown as the tooltip / helper text when the control is disabled */
  reason?: string;
}

/** The detail screen's actions. The API decides what is possible (actions[]); the session decides what the person may do. */
export function useDetailActions(id: string, overview: ProductOverview | undefined) {
  const navigate = useNavigate();
  const canWrite = useCan("products:write");
  const canPublish = useCan("listings:write");
  const duplicateM = useDuplicateProduct(id);
  const archiveM = useArchiveProduct(id);
  const exportM = useExportProduct();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const fromApi = (key: string, permitted: boolean): ActionState => {
    const a = findAction(overview?.actions, key);
    if (!a) return { enabled: false };
    if (!permitted) return { enabled: false, reason: NO_PERMISSION };
    return { enabled: a.enabled, reason: a.enabled ? undefined : disabledReasonText(a.disabledReason) };
  };

  const isArchived = overview?.product.status === "archived";
  const state = {
    edit: fromApi("edit_product", canWrite),
    variants: fromApi("manage_variants", true),
    inventory: fromApi("update_inventory", true),
    listings: fromApi("manage_listings", true),
    publish: fromApi("publish_product", canPublish),
    duplicate: fromApi("duplicate", canWrite),
    export: fromApi("export", true),
    archive: { enabled: canWrite, reason: canWrite ? undefined : NO_PERMISSION } satisfies ActionState,
  };

  const duplicate = () => {
    duplicateM.mutate(undefined, {
      onSuccess: (copy) => {
        toast({ title: "Product duplicated", description: `${copy.title} was created as a draft.`, variant: "success" });
        navigate(`${ROUTES.PRODUCTS}/${copy.id}`);
      },
      onError: (e) => toast({ title: "Could not duplicate the product", description: errorMessage(e), variant: "destructive" }),
    });
  };

  const archiveOrRestore = () => {
    const action = isArchived ? "unarchive" : "archive";
    archiveM.mutate(action, {
      onSuccess: () => {
        setArchiveOpen(false);
        toast({
          title: action === "archive" ? "Product archived" : "Product restored",
          description: action === "archive" ? `${overview?.product.title} is archived.` : `${overview?.product.title} is back as a draft.`,
          variant: "success",
        });
      },
      onError: (e) => {
        setArchiveOpen(false);
        toast({ title: `Could not ${action} the product`, description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  const exportCsv = () => {
    const a = findAction(overview?.actions, "export");
    if (!a || !overview) return;
    exportM.mutate(
      { href: a.href, fileName: exportFileName(overview.product.productCode) },
      {
        onSuccess: () => toast({ title: "Export ready", description: `${exportFileName(overview.product.productCode)} was downloaded.`, variant: "success" }),
        onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  return {
    state,
    isArchived,
    duplicate,
    duplicating: duplicateM.isPending,
    archiveOpen,
    setArchiveOpen,
    archiveOrRestore,
    archiving: archiveM.isPending,
    exportCsv,
    exporting: exportM.isPending,
    publishOpen,
    setPublishOpen,
  };
}

export type DetailActions = ReturnType<typeof useDetailActions>;

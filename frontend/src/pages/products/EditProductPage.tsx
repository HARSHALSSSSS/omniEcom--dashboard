import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { errorMessage, isApiError } from "@/api/errors";
import { useEditController } from "@/hooks/useProductEdit";
import { useToast } from "@/hooks/useToast";
import { AiPanel, type AiRequest } from "@/components/products/edit/AiPanel";
import { ConfirmImpactDialog, ConflictDialog, LeaveDialog } from "@/components/products/edit/Dialogs";
import { EditSidebar } from "@/components/products/edit/EditSidebar";
import { ImpactPanel } from "@/components/products/edit/ImpactPanel";
import { InsightsPanel } from "@/components/products/edit/InsightsPanel";
import { ProductInformation } from "@/components/products/edit/ProductInformation";
import { ReadinessPanel } from "@/components/products/edit/ReadinessPanel";
import { FIELD_LABEL, htmlToPlain, modifiedKeys, toFormValues } from "@/components/products/edit/form";
import type { AiMode } from "@/types/productEdit";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function EditProductPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { toast } = useToast();
  const ctl = useEditController(id);
  const { editor, values, base, dirty, canWrite, saving, blocker } = ctl;
  const [ai, setAi] = useState<AiRequest | null>(null);
  const openAi = (mode: AiMode) => setAi((a) => ({ mode, nonce: (a?.nonce ?? 0) + 1 }));

  const conflictLabels = useMemo(() => {
    if (!ctl.conflict?.current || !editor) return [];
    return modifiedKeys(toFormValues(editor.product), toFormValues(ctl.conflict.current.product)).map((k) => FIELD_LABEL[k]);
  }, [ctl.conflict, editor]);

  const save = async (confirm = false) => {
    const outcome = await ctl.submit(confirm);
    if (outcome === "saved") toast({ title: "Changes saved", variant: "success" });
  };

  // ---------------------------------------------------------------- loading / error
  if (ctl.editorQuery.isError) {
    const notFound = isApiError(ctl.editorQuery.error) && ctl.editorQuery.error.status === 404;
    return (
      <div role="alert" className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" aria-hidden="true" />
        <h1 className="text-lg font-semibold">{notFound ? "Product not found" : "Could not load this product"}</h1>
        <p className="text-sm text-muted-foreground">{notFound ? "It may have been deleted." : errorMessage(ctl.editorQuery.error)}</p>
        <div className="flex justify-center gap-2">
          {!notFound && (
            <Button type="button" size="sm" onClick={() => void ctl.editorQuery.refetch()}>
              Try again
            </Button>
          )}
          <Link to={ROUTES.PRODUCTS} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
            Back to products
          </Link>
        </div>
      </div>
    );
  }
  if (!editor || !values || !base) {
    return (
      <div role="status" aria-label="Loading product editor" className="flex h-96 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const product = editor.product;
  const stateLabel = dirty ? "Unsaved changes" : "Saved";
  const readOnlyReason = "You have view-only access to products.";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link to={`${ROUTES.PRODUCTS}/${product.id}`} aria-label="Back to product" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div>
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Master product &middot; <span className="font-mono">{editor.meta.productId}</span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[editor.status] ?? STATUS_STYLE.archived}`}>{editor.status}</span>
            </p>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Edit product</h1>
          </div>
          <span role="status" aria-live="polite" className={`text-xs font-medium ${dirty ? "text-amber-700" : "text-muted-foreground"}`}>
            {stateLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" disabled={!dirty || saving || !canWrite} onClick={ctl.revertAll}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Discard
          </Button>
          <Button type="button" size="sm" className="gap-1.5 text-xs" loading={saving} disabled={!dirty || !canWrite} title={canWrite ? undefined : readOnlyReason} onClick={() => void save()}>
            {!saving && <Save className="h-3.5 w-3.5" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      </header>

      {!canWrite && (
        <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {readOnlyReason} You can look at the product and preview its impact, but not change it.
        </p>
      )}
      {ctl.banner && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          <p>
            {ctl.banner.message}{" "}
            {ctl.banner.link && (
              <Link to={ctl.banner.link.to} className="font-medium underline">
                {ctl.banner.link.label}
              </Link>
            )}
          </p>
          <button type="button" className="font-medium underline" onClick={ctl.dismissBanner}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)_300px]">
        <EditSidebar editor={editor} />

        <div className="space-y-4">
          <ProductInformation ctl={ctl} onImproveWithAi={() => openAi("rewrite")} />
          {canWrite && <AiPanel productId={product.id} request={ai} getText={() => htmlToPlain(values.description)} onAccept={ctl.setDescriptionHtml} onClose={() => setAi(null)} />}
        </div>

        <div className="space-y-4">
          <ImpactPanel productId={product.id} dirty={dirty} impact={ctl.impact} pending={ctl.impactPending} failed={ctl.impactError} lastSave={ctl.lastSave} notice={ctl.notice} />
          <ReadinessPanel readiness={editor.readiness} />
          <InsightsPanel productId={product.id} editor={editor} canWrite={canWrite} onReviewSuggestion={() => openAi("benefits")} />
        </div>
      </div>

      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 py-2 text-xs backdrop-blur">
        <p className={dirty ? "font-medium text-amber-700" : "text-muted-foreground"}>{dirty ? "Unsaved changes" : "All changes saved"}</p>
      </footer>

      <ConfirmImpactDialog
        impact={ctl.confirmation}
        saving={saving}
        onCancel={ctl.closeConfirmation}
        onReview={() => {
          ctl.closeConfirmation();
          document.getElementById("change-impact")?.scrollIntoView?.({ behavior: "smooth" });
        }}
        onConfirm={() => void save(true)}
      />
      <ConflictDialog conflict={ctl.conflict} changedLabels={conflictLabels} hasMyEdits={dirty} onReload={ctl.reloadFromConflict} onClose={ctl.closeConflict} />
      <LeaveDialog
        open={blocker.state === "blocked"}
        saving={saving}
        onKeep={() => blocker.reset?.()}
        onDiscard={ctl.revertAll}
        onSave={() => void save()}
      />
    </div>
  );
}

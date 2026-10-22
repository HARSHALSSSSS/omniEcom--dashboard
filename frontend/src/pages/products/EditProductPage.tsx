import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { errorMessage, isApiError } from "@/api/errors";
import { useEditController } from "@/hooks/useProductEdit";
import { useToast } from "@/hooks/useToast";
import { useUiStore } from "@/store/ui.store";
import { AiPanel, type AiRequest } from "@/components/products/edit/AiPanel";
import { ConfirmImpactDialog, ConflictDialog, LeaveDialog, SaveImpactDialog } from "@/components/products/edit/Dialogs";
import { EditSidebar } from "@/components/products/edit/EditSidebar";
import { ImpactPanel } from "@/components/products/edit/ImpactPanel";
import { InsightsPanel } from "@/components/products/edit/InsightsPanel";
import { ProductInformation } from "@/components/products/edit/ProductInformation";
import { ReadinessPanel } from "@/components/products/edit/ReadinessPanel";
import { FIELD_LABEL, htmlToPlain, modifiedKeys, toFormValues } from "@/components/products/edit/form";
import type { AiMode } from "@/types/productEdit";

const STATUS_LABEL: Record<string, string> = { active: "Active", draft: "Draft", archived: "Archived" };

const actionClass = (enabled: boolean, primary: boolean) =>
  `flex items-center justify-center h-9 px-4 rounded-[8px] text-[12px] font-semibold leading-[145%] transition-colors ${
    enabled
      ? primary
        ? "bg-[#000000] text-white hover:bg-neutral-800 cursor-pointer"
        : "bg-white text-[#000000] hover:bg-neutral-100 cursor-pointer"
      : "bg-[#F5F5F5] text-[#9E9E9E] cursor-not-allowed"
  }`;

const BACK_LINK = "inline-flex h-9 items-center rounded-[8px] border border-[#666666] bg-white px-4 text-[12px] font-semibold text-[#000000] hover:bg-neutral-50";

export default function EditProductPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { sidebarCollapsed } = useUiStore();
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
      <div role="alert" className="mx-auto max-w-lg flex flex-col items-center gap-3 py-16 text-center font-['Inter',sans-serif] text-[#000000]">
        <AlertTriangle className="h-6 w-6 text-[#B45309]" aria-hidden="true" />
        <h1 className="text-[18px] font-semibold leading-[145%]">{notFound ? "Product not found" : "Could not load this product"}</h1>
        <p className="text-[13px] text-[#666666]">{notFound ? "It may have been deleted." : errorMessage(ctl.editorQuery.error)}</p>
        <div className="flex justify-center gap-2">
          {!notFound && (
            <button type="button" onClick={() => void ctl.editorQuery.refetch()} className="flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 cursor-pointer">
              Try again
            </button>
          )}
          <Link to={ROUTES.PRODUCTS} className={BACK_LINK}>
            Back to products
          </Link>
        </div>
      </div>
    );
  }
  if (!editor || !values || !base) {
    return (
      <div role="status" aria-label="Loading product editor" className="flex h-96 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#EAEAEA] border-t-[#000000]" />
      </div>
    );
  }

  const product = editor.product;
  const justSaved = !dirty && !!ctl.lastSave?.saved;
  const readOnlyReason = "You have view-only access to products.";
  const canAct = dirty && canWrite;

  const actions = (
    <div className="flex flex-row items-center gap-2 shrink-0">
      <button type="button" disabled={!dirty || saving || !canWrite} onClick={ctl.revertAll} className={actionClass(dirty && !saving && canWrite, false)}>
        Discard
      </button>
      <button type="button" disabled={!canAct || saving} title={canWrite ? undefined : readOnlyReason} onClick={() => void ctl.requestSave()} className={actionClass(canAct && !saving, true)}>
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col w-full text-[#000000] font-['Inter',sans-serif] pb-24">
      <div className="flex flex-col gap-2.5 pb-5 border-b border-[#EAEAEA]">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] leading-[145%] text-[#666666]">
          <Link to={ROUTES.PRODUCTS} className="hover:text-[#000000] transition-colors cursor-pointer">
            Products
          </Link>
          <span aria-hidden="true">/</span>
          <Link to={`${ROUTES.PRODUCTS}/${product.id}`} className="hover:text-[#000000] transition-colors cursor-pointer">
            {product.title}
          </Link>
        </nav>

        <div className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-3.5">
              <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">Edit product</h1>
              {(dirty || justSaved) && (
                <span role="status" aria-live="polite" className="text-[11px] font-normal text-[#666666] leading-[145%]">
                  {dirty ? "Unsaved changes" : "Saved"}
                </span>
              )}
            </div>
            <div className="flex flex-row items-center gap-3">
              <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                Master product &middot; <span>{editor.meta.productId}</span>
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 border border-[#EAEAEA] rounded-[2px] text-[11px] font-normal text-[#000000] leading-[145%]">
                {STATUS_LABEL[editor.status] ?? editor.status}
              </span>
            </div>
          </div>
          {actions}
        </div>
      </div>

      {!canWrite && (
        <p role="note" className="mt-4 rounded-[8px] bg-[#F5F5F5] p-3 text-[12px] text-[#666666] leading-[145%]">
          {readOnlyReason} You can look at the product and preview its impact, but not change it.
        </p>
      )}
      {ctl.banner && (
        <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-[8px] border border-[#B42318]/40 bg-[#FEF3F2] p-3 text-[12px] text-[#7A271A] leading-[145%]">
          <p>
            {ctl.banner.message}{" "}
            {ctl.banner.link && (
              <Link to={ctl.banner.link.to} className="font-semibold underline">
                {ctl.banner.link.label}
              </Link>
            )}
          </p>
          <button type="button" className="font-semibold underline cursor-pointer" onClick={ctl.dismissBanner}>
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-row items-start pt-6 gap-6 w-full flex-1">
        <EditSidebar editor={editor} />

        <ProductInformation
          ctl={ctl}
          onImproveWithAi={() => (ai ? setAi(null) : openAi("rewrite"))}
          aiOpen={!!ai}
          aiPanel={canWrite ? <AiPanel productId={product.id} request={ai} getText={() => htmlToPlain(values.description)} onAccept={ctl.setDescriptionHtml} onClose={() => setAi(null)} /> : null}
        />

        <div className="flex flex-col gap-5 w-[248px] border-l border-[#EAEAEA] pl-6 shrink-0">
          <ImpactPanel productId={product.id} dirty={dirty} impact={ctl.impact} pending={ctl.impactPending} failed={ctl.impactError} lastSave={ctl.lastSave} notice={ctl.notice} />
          <div className="w-full h-[1px] bg-[#EAEAEA]" />
          <ReadinessPanel readiness={editor.readiness} />
          <div className="w-full h-[1px] bg-[#EAEAEA]" />
          <InsightsPanel productId={product.id} editor={editor} canWrite={canWrite} onReviewSuggestion={() => openAi("benefits")} />
        </div>
      </div>

      <div
        className={`fixed bottom-0 right-0 z-20 flex flex-row items-center justify-between h-[72px] px-12 bg-white border-t border-[#EAEAEA] transition-all duration-300 ${sidebarCollapsed ? "left-14" : "left-[224px]"}`}
      >
        <div className="flex items-center gap-2">
          {!dirty && justSaved && <Check className="w-3.5 h-3.5 text-[#666666] stroke-[2.5]" aria-hidden="true" />}
          <span className="text-[12px] font-normal text-[#666666] leading-[145%]">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        </div>
        {actions}
      </div>

      <SaveImpactDialog
        open={!!ctl.saveDialog}
        impact={ctl.saveDialog?.impact ?? null}
        loading={ctl.saveDialog?.loading ?? false}
        failed={ctl.saveDialog?.failed ?? false}
        saving={saving}
        mapping={
          "categoryId" in ctl.changes
            ? { from: product.category?.name ?? "No category", to: values.categoryId ? ctl.categoryName(values.categoryId) : "No category" }
            : null
        }
        onReview={() => {
          ctl.closeSaveDialog();
          document.getElementById("change-impact")?.scrollIntoView?.({ behavior: "smooth" });
        }}
        onCancel={ctl.closeSaveDialog}
        onConfirm={() => {
          void save(false).then(ctl.closeSaveDialog);
        }}
      />
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
      <LeaveDialog open={blocker.state === "blocked"} saving={saving} onKeep={() => blocker.reset?.()} onDiscard={ctl.revertAll} onSave={() => void save()} />
    </div>
  );
}

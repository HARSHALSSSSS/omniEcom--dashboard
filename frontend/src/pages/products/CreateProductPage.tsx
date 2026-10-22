import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { errorMessage, isApiError } from "@/api/errors";
import { productCreationApi } from "@/api/productCreation.api";
import { useUiStore } from "@/store/ui.store";
import { CREATION_KEYS, useBrands, useCategoryTree, useFormOptions, useProductCreation } from "@/hooks/useProductCreation";
import { useProductCreationImage } from "@/hooks/useProductCreationImage";
import { useProductCreationAi } from "@/hooks/useProductCreationAi";
import type { CategoryNode, FixTarget } from "@/types/productCreation";
import { ActionBar } from "@/components/products/create/ActionBar";
import { AiImproveButton, AiImprovePanel } from "@/components/products/create/AiImprovePanel";
import { BrandField } from "@/components/products/create/BrandField";
import { DescriptionEditor } from "@/components/products/create/DescriptionEditor";
import { DraftsStrip } from "@/components/products/create/DraftsStrip";
import { LeaveDialog } from "@/components/products/create/LeaveDialog";
import { MoreInfoSection } from "@/components/products/create/MoreInfoSection";
import { PrimaryImageSection } from "@/components/products/create/PrimaryImageSection";
import { ReadinessPanel } from "@/components/products/create/ReadinessPanel";
import { SkuField } from "@/components/products/create/SkuField";
import { SelectField, TextField } from "@/components/products/create/fields";
import { ghostButton, outlineButton } from "@/components/products/create/fieldStyles";

const INDENT = String.fromCharCode(160, 160);
const TYPE_LABELS: Record<string, string> = { physical: "Physical product", digital: "Digital product", service: "Service / Warranty", bundle: "Bundle / Kit" };

/** the category tree as indented select options */
function flattenTree(nodes: CategoryNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [{ id: n.id, label: `${depth ? `${INDENT.repeat(depth)}- ` : ""}${n.name}` }, ...flattenTree(n.children ?? [], depth + 1)]);
}

export default function CreateProductPage() {
  const { sidebarCollapsed } = useUiStore();
  const canWrite = useCan("products:write");
  const qc = useQueryClient();
  const options = useFormOptions();
  const categories = useCategoryTree();
  const brands = useBrands();
  const c = useProductCreation({ canWrite, formOptions: options.data });
  const { form, values, errors, readiness } = c;
  const { register, setValue } = form;
  const limits = options.data?.limits;
  const readOnly = !canWrite;

  const img = useProductCreationImage({ productId: c.productId, rules: options.data?.image, ensureDraft: c.ensureDraft, onChanged: c.refreshReadiness });
  const ai = useProductCreationAi({
    productId: c.productId,
    ensureDraft: c.ensureDraft,
    flushSave: c.flushSave,
    getVersion: c.getVersion,
    setVersion: c.setVersion,
    getDescription: () => form.getValues("description") ?? "",
    onApplied: (html) => setValue("description", html, { shouldDirty: true }),
  });

  const categoryOptions = useMemo(() => flattenTree(categories.data ?? []), [categories.data]);
  const skuState = readiness?.required.find((i) => i.key === "master_sku")?.state;
  const skuWarning = c.warnings.find((w) => w.field === "productCode")?.message ?? null;
  const otherWarnings = c.warnings.filter((w) => w.field !== "productCode");

  /** saves the draft, then records the code as verified; resolves with an error text or null */
  const verifySku = useCallback(
    async (code: string): Promise<string | null> => {
      const id = await c.ensureDraft();
      if (!id) return "Enter a product name first, then verify the SKU.";
      if (!(await c.flushSave())) return "Save the draft first: it could not be saved right now.";
      try {
        await productCreationApi.verifySku(id, code);
        c.refreshReadiness();
        return null;
      } catch (e) {
        if (isApiError(e) && e.rule === "duplicate_product_code") return "Master SKU already exists. Use a unique SKU to continue.";
        return errorMessage(e, "Could not verify the SKU.");
      }
    },
    [c],
  );

  const confirmBrand = useCallback(async () => {
    const name = form.getValues("brand")?.trim();
    if (!name) {
      c.focusField("brand");
      return;
    }
    try {
      if (!(await c.flushSave())) throw new Error("The draft could not be saved");
      const list = await qc.fetchQuery({ queryKey: CREATION_KEYS.brands, queryFn: productCreationApi.brands, staleTime: 0 });
      const match = list.find((b) => b.name.trim().toLowerCase() === name.toLowerCase());
      if (!match) throw new Error("The brand is not in your brand list yet");
      await productCreationApi.confirmBrand(match.id);
      await qc.invalidateQueries({ queryKey: CREATION_KEYS.brands });
      c.refreshReadiness();
      toast({ title: "Brand confirmed", description: `${match.name} is confirmed.`, variant: "success" });
    } catch (e) {
      toast({ title: "Could not confirm the brand", description: errorMessage(e), variant: "destructive" });
    }
  }, [c, form, qc]);

  const onFix = useCallback(
    (target: FixTarget) => {
      c.focusField(target);
    },
    [c],
  );

  const onVerifyFromPanel = useCallback(async () => {
    const code = form.getValues("productCode")?.trim();
    if (!code) {
      c.focusField("master_sku");
      return;
    }
    const problem = await verifySku(code);
    if (problem) toast({ title: "Could not verify the SKU", description: problem, variant: "destructive" });
    else toast({ title: "Master SKU verified", variant: "success" });
  }, [c, form, verifySku]);

  // --------------------------------------------------------------------------------------- page states
  if (c.notADraft) {
    return (
      <div className="flex flex-col gap-3 py-10 max-w-[560px]">
        <h1 className="text-[22px] font-semibold text-[#000000]">This product is not a draft</h1>
        <p className="text-[13px] text-[#666666]">Only draft products can be edited in the creation flow. Open the product to edit it.</p>
        <Link to={ROUTES.PRODUCTS} className="text-[12px] font-semibold underline">
          Back to products
        </Link>
      </div>
    );
  }
  if (c.loadError) {
    const missing = isApiError(c.loadError) && c.loadError.status === 404;
    return (
      <div role="alert" className="flex flex-col gap-3 py-10 max-w-[560px]">
        <h1 className="text-[22px] font-semibold text-[#000000]">{missing ? "Draft not found" : "Could not open the draft"}</h1>
        <p className="text-[13px] text-[#666666]">{missing ? "This draft does not exist any more. It may have been discarded." : errorMessage(c.loadError)}</p>
        <div className="flex gap-2">
          <Link to={ROUTES.PRODUCTS_NEW} className={outlineButton}>
            Start a new product
          </Link>
          <Link to={ROUTES.PRODUCTS} className={ghostButton}>
            Back to products
          </Link>
        </div>
      </div>
    );
  }
  if (c.loading) {
    return (
      <div role="status" className="py-10 text-[13px] text-[#666666]">
        Opening your draft...
      </div>
    );
  }

  const uploading = img.uploadingHere;
  const codeShown = values.productCode.trim() || (c.dto && !c.dto.creation.codeIsPlaceholder ? c.dto.product.productCode : "");
  const savedText = c.saveStatus === "saving" ? "Saving · Basic information" : c.saveStatus === "saved" ? "Saved · Basic information" : "Not saved yet · Basic information";
  const showDrafts = !c.productId && !c.hasContent && canWrite;

  return (
    <div className="flex flex-col w-full text-[#000000] font-['Inter',sans-serif] pb-24">
      {/* 1. header */}
      <div className="flex flex-col gap-3 pb-6 border-b border-[#EAEAEA]">
        <div className="text-[12px] leading-[145%] text-[#666666]">Products / Create product</div>
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1.5 max-w-[936px]">
            <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">Create product</h1>
            <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Build a master product that can be distributed across your connected sales channels.</p>
          </div>
          <div className="flex flex-row items-center gap-2 shrink-0">
            <button type="button" onClick={() => void c.saveDraft()} disabled={readOnly || c.savingDraft || c.continuing} className={outlineButton}>
              {c.savingDraft ? "Saving..." : "Save draft"}
            </button>
            <button type="button" onClick={c.requestLeave} className={ghostButton}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* notices */}
      <div className="flex flex-col gap-3 pt-4 empty:hidden">
        {readOnly ? (
          <div role="status" className="p-3 border border-[#EAEAEA] rounded-[8px] bg-[#FAFAFA] text-[12px] text-[#333333]">
            You have read-only access to products, so this form is view only. Ask an administrator for edit access to create products.
          </div>
        ) : null}
        {c.saveStatus === "conflict" ? (
          <div role="alert" className="flex flex-col gap-2 p-3 border border-[#B42318] rounded-[8px] bg-[#FFF5F4]">
            <span className="text-[12px] font-semibold text-[#B42318]">This draft was changed somewhere else</span>
            <span className="text-[12px] text-[#333333]">Your latest edits were not saved. Reload the saved version, or keep your edits and save them over it.</span>
            <div className="flex gap-2">
              <button type="button" className={outlineButton} onClick={() => void c.resolveConflict("reload")}>
                Reload saved version
              </button>
              <button type="button" className={ghostButton} onClick={() => void c.resolveConflict("keep")}>
                Keep my changes
              </button>
            </div>
          </div>
        ) : null}
        {options.isError ? (
          <div role="alert" className="p-3 border border-[#B42318] rounded-[8px] text-[12px] text-[#B42318]">
            Could not load the form options ({errorMessage(options.error)}). Dropdowns and limits may be incomplete.{" "}
            <button type="button" className="underline font-semibold cursor-pointer" onClick={() => void options.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        <DraftsStrip visible={showDrafts} onResume={c.resumeDraft} />
      </div>

      {/* 2. workspace */}
      <div className="flex flex-row items-start pt-6 gap-8 w-full flex-1">
        <fieldset disabled={readOnly} className="flex flex-col gap-6 flex-1 min-w-0 border-0 p-0 m-0">
          <legend className="sr-only">Product details</legend>
          {!c.moreInfoOpen ? (
            <>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">Basic information</h2>
                <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Start with the information shared across your sales channels.</p>
                {uploading ? (
                  <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
                    {values.title || "New product"} · Primary image upload · {codeShown || "No SKU yet"}
                  </p>
                ) : null}
              </div>

              <PrimaryImageSection img={img} rules={options.data?.image} canWrite={canWrite} savedText={savedText} />

              <div className="flex flex-col gap-6 w-full">
                <div className="flex flex-col gap-2.5 w-full">
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Add your product</span>
                  <TextField
                    id="cp-title"
                    label="Product name"
                    placeholder="Product name"
                    maxLength={limits?.titleMax ?? 200}
                    error={errors.title}
                    hint="Use a clear, customer-facing product name."
                    {...register("title")}
                  />
                </div>

                <SelectField id="cp-productType" label="Product type" error={errors.productType} {...register("productType")}>
                  {(options.data?.productTypes ?? ["physical", "digital", "service"]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t] ?? t}
                    </option>
                  ))}
                </SelectField>

                <div className="flex flex-row items-start gap-5 w-full">
                  <SelectField
                    id="cp-categoryId"
                    label="Category"
                    className="flex-1"
                    empty={!values.categoryId}
                    error={errors.categoryId ?? (categories.isError ? "Could not load categories." : null)}
                    hint={!categories.isLoading && !categories.isError && categoryOptions.length === 0 ? "No categories yet. Create a category first." : undefined}
                    {...register("categoryId")}
                  >
                    <option value="">{categories.isLoading ? "Loading categories..." : "Select category"}</option>
                    {categoryOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </SelectField>

                  <BrandField
                    value={values.brand}
                    onChange={(name) => setValue("brand", name, { shouldDirty: true })}
                    brandRecord={c.dto?.product.brandRecord ?? null}
                    disabled={readOnly}
                    error={errors.brand}
                    maxLength={limits?.brandMax ?? 80}
                    onChanged={() => {
                      void brands.refetch();
                      c.refreshReadiness();
                    }}
                  />
                </div>

                <SkuField
                  value={values.productCode}
                  onChange={(code) => setValue("productCode", code, { shouldDirty: true })}
                  productId={c.productId}
                  skuState={skuState}
                  disabled={readOnly}
                  error={errors.productCode}
                  codeMax={limits?.codeMax ?? 64}
                  warning={skuWarning}
                  onVerify={verifySku}
                />

                <div className="flex flex-col gap-3 w-full">
                  <div className="flex flex-row justify-between items-center w-full">
                    <h3 className="text-[18px] font-semibold text-[#000000] leading-[145%]">Description</h3>
                    <AiImproveButton ai={ai} disabled={readOnly || ai.disabled} reason={readOnly ? "You have read-only access" : ai.problem?.message} />
                  </div>
                  <DescriptionEditor
                    value={values.description}
                    onChange={(html) => setValue("description", html, { shouldDirty: true })}
                    disabled={readOnly}
                    maxChars={limits?.descriptionMaxChars ?? 2000}
                    error={errors.description}
                  />
                </div>

                <AiImprovePanel ai={ai} />

                {otherWarnings.length ? (
                  <ul className="flex flex-col gap-1 text-[11px] text-[#666666]" aria-label="Warnings">
                    {otherWarnings.map((w) => (
                      <li key={`${w.field}-${w.code}`}>{w.message}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-col gap-2 pt-4 pb-2 border-t border-[#EAEAEA] w-full">
                  <button type="button" onClick={() => c.setMoreInfoOpen(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer text-left">
                    <span>Add more product information +</span>
                  </button>
                  <span className="text-[11px] text-[#666666] leading-[145%]">Optional details can be added later. You can always save a draft.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-5 w-full animate-in fade-in duration-200">
              <div className="flex flex-col gap-1.5 w-full">
                <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">Basic information</h2>
                <div className="text-[13px] font-normal text-[#666666] leading-[145%]">
                  {values.title || "New product"} · {codeShown || "No SKU yet"}
                </div>
                <div className="text-[11px] font-normal text-[#666666] leading-[145%]">Identity and description above · Lower editor view</div>
              </div>
              <div className="w-full h-[1px] bg-[#EAEAEA]" />
              <button type="button" onClick={() => c.setMoreInfoOpen(false)} className="flex items-center gap-1.5 text-[12px] font-semibold text-[#000000] leading-[145%] hover:underline cursor-pointer text-left">
                <span>Add more product information −</span>
              </button>
              <p className="text-[13px] font-normal text-[#666666] leading-[145%] -mt-2">Optional information improves listing quality. Leave any field blank and save a draft.</p>
              <MoreInfoSection form={form} values={values} options={options.data} errors={errors} disabled={readOnly} />
            </div>
          )}
        </fieldset>

        <ReadinessPanel readiness={readiness} loading={c.readinessLoading} onFix={onFix} onVerify={() => void onVerifyFromPanel()} onConfirmBrand={() => void confirmBrand()} />
      </div>

      <ActionBar
        sidebarCollapsed={sidebarCollapsed}
        canWrite={canWrite}
        status={c.saveStatus}
        savedAt={c.savedAt}
        saveError={c.saveError}
        hasDraft={!!c.productId}
        unsaved={c.unsaved}
        savingDraft={c.savingDraft}
        continuing={c.continuing}
        onSaveDraft={() => void c.saveDraft()}
        onRetry={c.retrySave}
        onBack={c.requestLeave}
        onContinue={() => void c.continueToVariants()}
      />

      <LeaveDialog
        open={c.leave.open}
        productName={values.title}
        hasDraft={!!c.productId}
        unsaved={c.unsaved}
        busy={c.savingDraft || c.discarding}
        error={c.leave.error}
        onStay={c.closeLeave}
        onSave={() => void c.leaveSave()}
        onDiscard={() => void c.leaveDiscard()}
      />
    </div>
  );
}

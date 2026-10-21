import { useRef } from "react";
import { Check, ImagePlus } from "lucide-react";
import { formatBytes, useDocumentImageUrl, type useProductCreationImage } from "@/hooks/useProductCreationImage";
import type { FormOptions } from "@/types/productCreation";
import { errorClass, ghostButton, hintClass, outlineButton } from "./fieldStyles";

type ImageController = ReturnType<typeof useProductCreationImage>;

interface Props {
  img: ImageController;
  rules: FormOptions["image"] | undefined;
  canWrite: boolean;
  /** "Saved" line of the upload screen */
  savedText: string;
}

const rulesText = (r: FormOptions["image"] | undefined) =>
  r ? `JPG, PNG, WebP or GIF · up to ${Math.round(r.maxBytes / (1024 * 1024))} MB · at least ${r.minShortSidePx} px (${r.recommendedLongSidePx} px or more is recommended)` : "JPG, PNG, WebP or GIF";

/** the media stage: add / uploading (real progress, cancel) / uploaded / placeholder, with the per-rule server errors */
export function PrimaryImageSection({ img, rules, canWrite, savedText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { image, upload, uploadingHere } = img;
  const doc = image?.document ?? null;
  const url = useDocumentImageUrl(image && (image.state === "ready" || image.state === "placeholder") ? doc?.id : null);
  const pending = image?.state === "uploading" && !uploadingHere;
  const percent = upload.total > 0 ? Math.min(100, Math.round((upload.loaded / upload.total) * 100)) : 0;
  const open = () => inputRef.current?.click();
  const busy = img.working;

  const chooser = (
    <input
      ref={inputRef}
      type="file"
      accept={rules ? rules.mimeTypes.join(",") : "image/jpeg,image/png,image/webp,image/gif"}
      className="hidden"
      aria-label="Choose a product image"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void img.pickFile(file);
      }}
    />
  );
  const actions = (uploadLabel: string) => (
    <div className="flex flex-row items-center gap-2 pt-1">
      <button id="cp-primary-image" type="button" className={outlineButton} disabled={!canWrite || busy} onClick={open}>
        {uploadLabel}
      </button>
      <button type="button" className={ghostButton} disabled={!canWrite || busy || image?.state === "ready"} title={image?.state === "ready" ? "This product already has a real image" : undefined} onClick={() => void img.generatePlaceholder()}>
        Generate placeholder
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------------- uploading from this page
  if (uploadingHere) {
    return (
      <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200" aria-label="Primary image upload">
        {chooser}
        <div className="flex flex-col items-center justify-center gap-4 w-full h-[280px] border border-[#EAEAEA] rounded-[4px] bg-white">
          <div className="w-[180px] h-[164px] rounded-[4px] overflow-hidden flex items-center justify-center bg-[#F5F5F5]">
            {upload.previewUrl ? <img src={upload.previewUrl} alt="Local preview of the selected image" className="w-full h-full object-cover" /> : null}
          </div>
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">Local preview · Upload in progress</span>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <div className="flex flex-row justify-between items-center w-full text-[12px] leading-[145%]">
            <span className="font-semibold text-[#000000]">{upload.fileName}</span>
            <span className="font-medium text-[#000000]">{percent}%</span>
          </div>
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden">
            <div className="h-full bg-[#000000] transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-row justify-between items-center w-full">
            <span className="text-[11px] text-[#666666] leading-[145%]" aria-live="polite">
              {upload.phase === "registering" ? "Preparing the upload..." : `${formatBytes(upload.loaded)} of ${formatBytes(upload.total)} · Uploading primary image`}
            </span>
            <button type="button" onClick={() => void img.cancelUpload()} className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer">
              Cancel upload
            </button>
          </div>
          <p className="text-[11px] text-[#666666] leading-[145%] pt-1">The image will become your primary image after uploading. Product readiness will update when the file is available.</p>
        </div>
        <div className="w-full h-[1px] bg-[#EAEAEA]" />
        <div className="flex flex-col gap-3 w-full">
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Primary image</span>
          <p className="text-[13px] text-[#666666] leading-[145%]">Use a clear product image. This becomes the default image inherited by connected listings.</p>
          {actions("Upload")}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#666666] leading-[145%] pt-2">
          <Check className="w-3.5 h-3.5 text-[#666666]" aria-hidden />
          <span>{savedText}</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------------- idle, uploaded, placeholder, failed
  return (
    <div className="flex flex-col gap-2 w-full">
      {chooser}
      <div id="cp-primary-image-stage" className="flex flex-col items-center justify-center gap-3 w-full min-h-[176px] border border-[#EAEAEA] rounded-[4px] bg-white py-3">
        {pending ? (
          <>
            <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">An image upload is in progress</span>
            <span className={hintClass}>{doc?.fileName ?? "Started in another window"} · Publication stays blocked until it completes.</span>
            <button type="button" className={outlineButton} disabled={!canWrite} onClick={() => void img.cancelUpload()}>
              Cancel upload
            </button>
          </>
        ) : image && (image.state === "ready" || image.state === "placeholder") && doc ? (
          <div className="flex flex-col items-center gap-3 w-full px-3">
            <div className="h-[120px] flex items-center justify-center">
              {url ? (
                <img src={url} alt={image.state === "placeholder" ? "Placeholder image" : `Primary image ${doc.fileName}`} className="max-h-[120px] max-w-full object-contain rounded" />
              ) : (
                <span className={hintClass}>Loading image...</span>
              )}
            </div>
            <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">{image.state === "placeholder" ? "Placeholder image" : doc.fileName}</span>
            {image.state === "placeholder" ? <span className={hintClass}>A placeholder never counts for publishing. Upload a real image to replace it.</span> : null}
            {doc.width && doc.height ? (
              <span className={hintClass}>
                {doc.width} x {doc.height} px
              </span>
            ) : null}
            {img.warnings.includes("low_resolution") || doc.warnings?.includes("low_resolution") ? (
              <span className={hintClass}>Low resolution: marketplaces prefer {rules?.recommendedLongSidePx ?? 1000} px or more on the longer side.</span>
            ) : null}
            <div className="flex flex-row items-center gap-2">
              <button id="cp-primary-image" type="button" className={outlineButton} disabled={!canWrite || busy} onClick={open}>
                {image.state === "placeholder" ? "Upload real image" : "Replace image"}
              </button>
              <button type="button" className={ghostButton} disabled={!canWrite || busy} onClick={() => void img.removeImage(doc)}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <>
            <ImagePlus className="w-6 h-6 text-[#666666]" strokeWidth={1.5} aria-hidden />
            <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">Add product image</span>
            {actions("Upload")}
          </>
        )}
      </div>
      <span className={hintClass}>{rulesText(rules)}</span>
      {upload.phase === "failed" && upload.error ? (
        <div role="alert" className="flex flex-row items-center gap-3">
          <span className={errorClass}>{upload.error}</span>
          <button type="button" className="text-[11px] font-semibold underline cursor-pointer" onClick={img.dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}
      {img.actionError ? (
        <span role="alert" className={errorClass}>
          {img.actionError}
        </span>
      ) : null}
    </div>
  );
}

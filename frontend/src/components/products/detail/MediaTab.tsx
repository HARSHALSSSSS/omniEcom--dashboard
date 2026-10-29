import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Trash2, Upload } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useDeleteImage, useProductImages, useReorderImages, useSetPrimaryImage, useUploadImages } from "@/hooks/useProductDetail";
import { toast } from "@/hooks/useToast";
import type { ProductDocument } from "@/types/productDetail";
import { ProductImage } from "./ProductImage";
import { AsideRows, Empty, SectionHead, TabError, TabLayout, TabSkeleton } from "./shared";
import { NO_PERMISSION } from "./format";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

const ICON_BTN =
  "h-7 w-7 min-h-[36px] min-w-[36px] sm:min-h-7 sm:min-w-7 inline-flex items-center justify-center rounded-[6px] border border-[#EAEAEA] bg-white text-[#000000] hover:bg-[#F5F5F5] cursor-pointer disabled:cursor-not-allowed disabled:text-[#BDBDBD] disabled:hover:bg-white";

/** the gallery of a product: real images, make primary, reorder, upload */
export function MediaTab({ id, title }: { id: string; title: string }) {
  const canWrite = useCan("documents:write");
  const q = useProductImages(id, true);
  const setPrimary = useSetPrimaryImage(id);
  const reorder = useReorderImages(id);
  const upload = useUploadImages(id);
  const remove = useDeleteImage(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [percent, setPercent] = useState<number | null>(null);

  if (q.isPending) return <TabSkeleton label="media" />;
  if (q.isError) return <TabError label="media" error={q.error} onRetry={() => void q.refetch()} />;

  const images: ProductDocument[] = q.data.filter((d) => d.status === "uploaded" || d.status === "processed");
  const busy = setPrimary.isPending || reorder.isPending || upload.isPending || remove.isPending;
  const lowRes = images.filter((d) => d.warnings.includes("low_resolution")).length;
  const hasPlaceholder = images.some((d) => d.isPlaceholder);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    const a = images[index];
    const b = images[target];
    if (!a || !b) return;
    const next = [...images];
    next[index] = b;
    next[target] = a;
    const changes = next.flatMap((d, i) => (d.sortOrder !== i ? [{ documentId: d.id, sortOrder: i }] : []));
    reorder.mutate(changes, { onError: (e) => toast({ title: "Could not reorder the images", description: errorMessage(e), variant: "destructive" }) });
  };

  const makePrimary = (d: ProductDocument) =>
    setPrimary.mutate(d.id, {
      onSuccess: () => toast({ title: "Primary image updated", description: `${d.fileName} is now the primary image.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not change the primary image", description: errorMessage(e), variant: "destructive" }),
    });

  const deleteImage = (d: ProductDocument) =>
    remove.mutate(d.id, {
      onSuccess: () => toast({ title: "Image deleted", description: `${d.fileName} was removed.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not delete image", description: errorMessage(e), variant: "destructive" }),
    });

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    const bad = files.find((f) => !ACCEPT.includes(f.type) || f.size > MAX_BYTES);
    if (bad) {
      toast({ title: "File not accepted", description: `${bad.name}: use JPG, PNG, WEBP or GIF up to 10 MB.`, variant: "destructive" });
      return;
    }
    setPercent(0);
    upload.mutate(
      { files, onProgress: setPercent },
      {
        onSuccess: () => toast({ title: files.length === 1 ? "Image uploaded" : `${files.length} images uploaded`, variant: "success" }),
        onError: (e) => toast({ title: "Upload failed", description: errorMessage(e), variant: "destructive" }),
        onSettled: () => setPercent(null),
      },
    );
  };

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Media summary" />
          <AsideRows
            rows={[
              ["Images", images.length],
              ["Primary image", images.some((d) => d.isPrimary) ? "Set" : "Not set"],
              ["Low resolution", lowRes],
            ]}
          />
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
            JPG, PNG, WEBP or GIF up to 10 MB. Marketplaces prefer images of at least 1000 px on the longer side. The primary image is the one shown in lists and on listings.
          </p>
          {hasPlaceholder ? <p className="text-[12px] font-normal leading-[17px] text-[#666666]">A generated placeholder is in use. Upload a real image to replace it before publishing.</p> : null}
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Product media"
          sub={`${images.length} ${images.length === 1 ? "image" : "images"}`}
          action={
            <>
              <input ref={fileRef} type="file" accept={ACCEPT.join(",")} multiple hidden aria-label="Upload images" onChange={(e) => onFiles(e.target.files)} />
              <button
                type="button"
                disabled={!canWrite || busy}
                title={canWrite ? undefined : NO_PERMISSION}
                onClick={() => fileRef.current?.click()}
                className="px-4 h-[44px] sm:h-[36px] bg-[#FFFFFF] border border-[#666666] text-[#000000] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5] transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:border-[#BDBDBD]"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {percent === null ? "Upload images" : `Uploading ${percent}%`}
              </button>
            </>
          }
        />

        {images.length === 0 ? (
          <Empty title="No images yet" text="Products need at least one image before they can be published." />
        ) : (
          <ul aria-label="Product images" className={`w-full grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 ${busy ? "opacity-70" : ""}`}>
            {images.map((d, i) => (
              <li key={d.id} className="flex flex-col items-start gap-2">
                <ProductImage url={d.downloadUrl} alt={`${title} - ${d.fileName}`} className="w-full aspect-square rounded-[8px] border border-[#EAEAEA]" />
                <div className="w-full flex flex-col gap-1">
                  <span className="text-[12px] leading-[17px] text-[#000000] break-all">{d.fileName}</span>
                  <span className="text-[11px] leading-[16px] text-[#666666]">
                    {d.isPrimary ? "Primary image" : `Image ${i + 1}`}
                    {d.warnings.includes("low_resolution") ? " · Low resolution" : ""}
                    {d.isPlaceholder ? " · Placeholder" : ""}
                  </span>
                </div>
                <div className="flex flex-row flex-wrap items-center gap-1.5">
                  <button type="button" aria-label={`Move ${d.fileName} earlier`} disabled={!canWrite || busy || i === 0} title={canWrite ? undefined : NO_PERMISSION} onClick={() => move(i, -1)} className={ICON_BTN}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move ${d.fileName} later`} disabled={!canWrite || busy || i === images.length - 1} title={canWrite ? undefined : NO_PERMISSION} onClick={() => move(i, 1)} className={ICON_BTN}>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {d.isPrimary ? null : (
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      title={canWrite ? undefined : NO_PERMISSION}
                      onClick={() => makePrimary(d)}
                      className="px-2.5 h-[36px] sm:h-7 rounded-[6px] border border-[#EAEAEA] bg-white text-[11px] font-semibold text-[#000000] hover:bg-[#F5F5F5] cursor-pointer disabled:cursor-not-allowed disabled:text-[#BDBDBD] disabled:hover:bg-white flex items-center"
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${d.fileName}`}
                    disabled={!canWrite || busy}
                    title={canWrite ? undefined : NO_PERMISSION}
                    onClick={() => deleteImage(d)}
                    className={`${ICON_BTN} hover:text-[#B42318] hover:border-[#F2B8B5]`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </TabLayout>
  );
}

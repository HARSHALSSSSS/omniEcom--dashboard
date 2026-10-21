import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { productCreationApi } from "@/api/productCreation.api";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { CREATION_KEYS } from "@/hooks/useProductCreation";
import type { DocumentDto, FormOptions, PrimaryImage } from "@/types/productCreation";

export type UploadPhase = "idle" | "registering" | "uploading" | "failed";
export interface UploadState {
  phase: UploadPhase;
  fileName: string;
  loaded: number;
  total: number;
  /** local object URL of the picked file (shown while the upload runs) */
  previewUrl: string | null;
  error: string | null;
}
const IDLE: UploadState = { phase: "idle", fileName: "", loaded: 0, total: 0, previewUrl: null, error: null };

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
export const formatBytes = (bytes: number) => (bytes >= 1024 * 1024 ? mb(bytes) : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** the sentence for a rejected image (the server names the rule in `details.rule`) */
export function imageErrorMessage(e: unknown, rules?: FormOptions["image"]): string {
  if (isApiError(e)) {
    switch (e.rule) {
      case "mime_mismatch":
        return "The file content does not match its type. Use a real JPG, PNG, WebP or GIF image.";
      case "image_too_small":
        return `The image is too small: the shorter side must be at least ${rules?.minShortSidePx ?? 200} px.`;
      case "image_too_large_pixels":
        return "The image has too many pixels (over 100 megapixels). Resize it and try again.";
      case "image_corrupt":
        return "The image file is damaged or incomplete. Export it again and retry.";
      case "file_too_large":
        return `The image is larger than ${rules ? mb(rules.maxBytes) : "10 MB"}.`;
      case "image_limit":
        return `A product can have at most ${rules?.maxPerProduct ?? 20} images.`;
      case "has_primary_image":
        return "This product already has a real primary image, so a placeholder is not needed.";
      default:
        break;
    }
    if (e.status === 413) return `The image is larger than ${rules ? mb(rules.maxBytes) : "10 MB"}.`;
    if (e.status === 415) return "That file type is not accepted. Use a JPG, PNG, WebP or GIF image.";
  }
  return errorMessage(e, "The image could not be uploaded.");
}

/** client-side check of the rules `GET /products/form-options` reports (the server checks again) */
export function checkImageFile(file: { name: string; type: string; size: number }, rules: FormOptions["image"] | undefined): string | null {
  if (rules && !rules.mimeTypes.includes(file.type)) return `${file.name || "This file"} is not an accepted image type. Use JPG, PNG, WebP or GIF.`;
  if (!rules && !/^image\//.test(file.type)) return "Choose an image file.";
  if (file.size <= 0) return "This file is empty.";
  if (rules && file.size > rules.maxBytes) return `${file.name || "This file"} is ${mb(file.size)}. Images can be up to ${mb(rules.maxBytes)}.`;
  return null;
}

interface Options {
  productId: string | null;
  rules: FormOptions["image"] | undefined;
  ensureDraft: () => Promise<string | null>;
  /** readiness and the saved product changed (image added, removed, replaced) */
  onChanged: () => void;
}

export function useProductCreationImage({ productId, rules, ensureDraft, onChanged }: Options) {
  const qc = useQueryClient();
  const [upload, setUpload] = useState<UploadState>(IDLE);
  const [warnings, setWarnings] = useState<DocumentDto["warnings"]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const ctlRef = useRef<AbortController | null>(null);
  const docRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const previewRef = useRef<string | null>(null);

  const primary = useQuery({
    queryKey: CREATION_KEYS.primaryImage(productId ?? ""),
    queryFn: () => productCreationApi.primaryImage(productId as string),
    enabled: !!productId,
    staleTime: 0,
    // an upload that started elsewhere finishes on its own: watch it
    refetchInterval: (q) => (q.state.data?.state === "uploading" && upload.phase === "idle" ? 4000 : false),
  });

  const revokePreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);
  useEffect(() => () => revokePreview(), [revokePreview]);

  const refresh = useCallback(async () => {
    if (productId) await qc.invalidateQueries({ queryKey: CREATION_KEYS.primaryImage(productId) });
    onChanged();
  }, [onChanged, productId, qc]);

  const pickFile = useCallback(
    async (file: File) => {
      setActionError(null);
      if (upload.phase === "registering" || upload.phase === "uploading") return;
      const problem = checkImageFile(file, rules);
      if (problem) {
        setUpload({ ...IDLE, phase: "failed", fileName: file.name, error: problem });
        return;
      }
      const id = await ensureDraft();
      if (!id) {
        setUpload({ ...IDLE, phase: "failed", fileName: file.name, error: "Enter a product name first, then add the image." });
        return;
      }
      revokePreview();
      previewRef.current = URL.createObjectURL(file);
      cancelledRef.current = false;
      docRef.current = null;
      const ctl = new AbortController();
      ctlRef.current = ctl;
      setWarnings([]);
      setUpload({ phase: "registering", fileName: file.name, loaded: 0, total: file.size, previewUrl: previewRef.current, error: null });
      try {
        const registered = await productCreationApi.registerImage(id, file);
        docRef.current = registered.document.id;
        if (cancelledRef.current) {
          await productCreationApi.cancelUpload(registered.document.id).catch(() => undefined);
          return;
        }
        // the server now knows an upload is pending: the readiness item turns to "Uploading"
        onChanged();
        void qc.invalidateQueries({ queryKey: CREATION_KEYS.primaryImage(id) });
        setUpload((u) => ({ ...u, phase: "uploading" }));
        const doc = await productCreationApi.uploadImageBytes(registered, file, {
          signal: ctl.signal,
          onProgress: (p) => setUpload((u) => (u.phase === "uploading" ? { ...u, loaded: p.loaded, total: p.total || file.size } : u)),
        });
        setWarnings(doc.warnings ?? []);
        revokePreview();
        setUpload(IDLE);
        toast({ title: "Image uploaded", description: `${file.name} is now the primary image.`, variant: "success" });
        await refresh();
      } catch (e) {
        const aborted = cancelledRef.current || (e as { code?: string })?.code === "ERR_CANCELED" || (e as { name?: string })?.name === "CanceledError";
        if (aborted) {
          setUpload(IDLE);
          revokePreview();
          await refresh();
          return;
        }
        // the server removes a rejected upload; make sure nothing stays pending
        if (docRef.current && !(isApiError(e) && e.status < 500 && e.status >= 400 && e.rule !== null)) {
          await productCreationApi.cancelUpload(docRef.current).catch(() => undefined);
        }
        setUpload((u) => ({ ...u, phase: "failed", error: imageErrorMessage(e, rules) }));
        await refresh();
      } finally {
        ctlRef.current = null;
      }
    },
    [ensureDraft, onChanged, qc, refresh, revokePreview, rules, upload.phase],
  );

  const cancelUpload = useCallback(async () => {
    cancelledRef.current = true;
    ctlRef.current?.abort();
    const doc = docRef.current ?? (primary.data?.state === "uploading" ? primary.data.document?.id ?? null : null);
    setUpload(IDLE);
    revokePreview();
    if (doc) {
      try {
        await productCreationApi.cancelUpload(doc);
      } catch (e) {
        setActionError(errorMessage(e, "Could not cancel the upload."));
      }
    }
    await refresh();
  }, [primary.data, refresh, revokePreview]);

  const dismissError = useCallback(() => {
    setUpload((u) => (u.phase === "failed" ? IDLE : u));
    setActionError(null);
    revokePreview();
  }, [revokePreview]);

  const generatePlaceholder = useCallback(async () => {
    setActionError(null);
    setWorking(true);
    try {
      const id = await ensureDraft();
      if (!id) {
        setActionError("Enter a product name first, then generate a placeholder.");
        return;
      }
      await productCreationApi.generatePlaceholder(id);
      toast({ title: "Placeholder added", description: "A placeholder never counts for publishing. Replace it with a real image." });
      await refresh();
    } catch (e) {
      setActionError(imageErrorMessage(e, rules));
      await refresh();
    } finally {
      setWorking(false);
    }
  }, [ensureDraft, refresh, rules]);

  const removeImage = useCallback(
    async (doc: DocumentDto) => {
      setActionError(null);
      setWorking(true);
      try {
        await productCreationApi.deleteDocument(doc.id);
        setWarnings([]);
        await refresh();
      } catch (e) {
        setActionError(errorMessage(e, "Could not remove the image."));
      } finally {
        setWorking(false);
      }
    },
    [refresh],
  );

  const image: PrimaryImage | undefined = productId ? primary.data : { state: "none", document: null };
  const uploadingHere = upload.phase === "registering" || upload.phase === "uploading";
  return {
    image,
    imageLoading: !!productId && primary.isLoading,
    upload,
    warnings,
    actionError,
    working: working || uploadingHere,
    uploadingHere,
    pickFile,
    cancelUpload,
    dismissError,
    generatePlaceholder,
    removeImage,
  };
}

/** an authenticated image as a blob URL (an <img> tag cannot send the bearer token, and presigned URLs expire) */
export function useDocumentImageUrl(documentId: string | null | undefined): string | null {
  const q = useQuery({
    queryKey: ["productCreation", "document-blob", documentId ?? ""],
    queryFn: () => productCreationApi.documentBlob(documentId as string),
    enabled: !!documentId,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return documentId ? url : null;
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/api/client";

interface AuthThumbnailProps {
  /** the API's thumbnailUrl, `/api/v1/documents/{id}/content` */
  url: string | null;
  alt: string;
  /** shown when there is no image */
  initials: string;
  /** a 40px thumbnail for table rows (initials only, no caption) */
  compact?: boolean;
}

/**
 * Product images are served through the API with a bearer token, so a plain <img src> cannot load them.
 * The bytes are fetched through the API client (token, refresh and tenant included), cached by react-query and
 * shown from an object URL that is released when the card goes away.
 */
export function AuthThumbnail({ url, alt, initials, compact = false }: AuthThumbnailProps) {
  const box = compact ? "w-10 h-10" : "w-[88px] h-[88px]";
  const { data: blob, isError } = useQuery({
    queryKey: ["products", "thumbnail", url],
    // the client already prefixes the API base, so the base is dropped from the path the API returned
    queryFn: async () => (await client.get<Blob>((url ?? "").replace(/^\/api\/v1/, ""), { responseType: "blob" })).data,
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (src) {
    return <img src={src} alt={alt} className={`${box} rounded-[8px] object-cover bg-[#F5F5F5] shrink-0 border border-[#EAEAEA]`} />;
  }
  const loading = Boolean(url) && !isError;
  return (
    <div
      className={`${box} rounded-[8px] bg-[#F5F5F5] flex flex-col items-center justify-center gap-1 shrink-0 ${loading ? "animate-pulse" : ""}`}
      role="img"
      aria-label={loading ? "Loading image" : "No image"}
    >
      {!loading && compact && <span className="text-[12px] font-medium text-[#666666]">{initials}</span>}
      {!loading && !compact && (
        <>
          <span className="text-[22px] font-medium leading-[28px] text-[#666666]">{initials}</span>
          <span className="text-[11px] font-normal leading-[16px] text-[#666666]">{url ? "Image unavailable" : "Image required"}</span>
        </>
      )}
    </div>
  );
}

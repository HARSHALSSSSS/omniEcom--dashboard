import { ImageOff } from "lucide-react";
import { useImageSrc } from "@/hooks/useProductDetail";

/** An image behind the authenticated content route (or a pre-signed link). Shows a neutral box until it is there. */
export function ProductImage({ url, alt, className = "" }: { url: string | null | undefined; alt: string; className?: string }) {
  const { src, failed } = useImageSrc(url);
  if (src) return <img src={src} alt={alt} className={`object-cover ${className}`} />;
  return (
    <div
      role="img"
      aria-label={failed || !url ? `${alt} (no image)` : `${alt} (loading)`}
      className={`flex items-center justify-center bg-[#F5F5F5] text-[#BDBDBD] ${url && !failed ? "animate-pulse" : ""} ${className}`}
    >
      {failed || !url ? <ImageOff className="h-5 w-5" aria-hidden="true" /> : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { variantsApi } from "@/api/variants.api";
import { cn } from "@/utils/cn";

const MAX_IMAGE_CACHE = 100;
const cache = new Map<string, Promise<string>>();

function objectUrlFor(url: string): Promise<string> {
  let hit = cache.get(url);
  if (hit) {
    // Re-insert to keep LRU order
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }

  // Evict oldest entry when reaching capacity
  if (cache.size >= MAX_IMAGE_CACHE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      const oldestPromise = cache.get(oldestKey);
      cache.delete(oldestKey);
      oldestPromise
        ?.then((objUrl) => {
          try {
            URL.revokeObjectURL(objUrl);
          } catch {
            // ignore revoke errors
          }
        })
        .catch(() => {});
    }
  }

  hit = variantsApi.image(url).then((blob) => URL.createObjectURL(blob));
  hit.catch(() => cache.delete(url));
  cache.set(url, hit);
  return hit;
}

/** Product / variant images are served behind the bearer token, so an <img src> cannot load them directly. */
export function AuthImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [resolved, setResolved] = useState<{ src: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!src) return;
    let live = true;
    if (/^(blob:|data:|https?:)/.test(src)) {
      setResolved({ src, url: src });
      return;
    }
    objectUrlFor(src).then(
      (url) => live && setResolved({ src, url }),
      () => live && setResolved({ src, url: null }),
    );
    return () => {
      live = false;
    };
  }, [src]);

  const url = src && resolved?.src === src ? resolved.url : null;
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-[#F5F5F5] text-[#BDBDBD]", className)} role="img" aria-label={alt}>
        <ImageOff className="h-1/3 w-1/3" aria-hidden />
      </div>
    );
  }
  return <img src={url} alt={alt} className={cn("object-cover", className)} />;
}

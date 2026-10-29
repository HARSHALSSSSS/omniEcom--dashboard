import { ArrowDown, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import type { CreationReadiness, FixTarget, ReadinessItem, ReadinessState } from "@/types/productCreation";
import { outlineButton } from "./fieldStyles";

const TAGS: Partial<Record<ReadinessState, string>> = {
  verify: "Verify",
  confirm: "Confirm",
  duplicate: "Duplicate",
  uploading: "Uploading",
  placeholder: "Placeholder",
};

interface Props {
  readiness: CreationReadiness | null;
  loading: boolean;
  onFix: (target: FixTarget) => void;
  onVerify: () => void;
  onConfirmBrand: () => void;
}

const FIX_FOR_KEY: Record<string, FixTarget> = { product_name: "product_name", category: "category", primary_image: "primary_image", master_sku: "master_sku" };

function Row({ item, onTag }: { item: ReadinessItem; onTag: (item: ReadinessItem) => void }) {
  const tag = item.state === "done" || item.state === "pending" ? null : (item.tag ?? TAGS[item.state] ?? null);
  return (
    <li className="flex flex-row items-center justify-between text-[12px] leading-[145%]" data-state={item.state}>
      <div className="flex items-center gap-2.5">
        {item.state === "done" ? (
          <Check className="w-3.5 h-3.5 text-[#000000] stroke-[2.5]" aria-label="Done" />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full border border-[#666666] shrink-0" aria-label="Not done yet" role="img" />
        )}
        <span className="text-[#000000]">{item.label}</span>
      </div>
      {tag ? (
        <button
          type="button"
          onClick={() => onTag(item)}
          className={`text-[10px] leading-[145%] underline-offset-2 hover:underline cursor-pointer ${item.state === "duplicate" ? "text-[#B42318]" : "text-[#666666]"}`}
          aria-label={`${tag}: ${item.label}`}
        >
          {tag}
        </button>
      ) : null}
    </li>
  );
}

/** the right-hand readiness rail: everything comes from the creation readiness API */
export function ReadinessPanel({ readiness, loading, onFix, onVerify, onConfirmBrand }: Props) {
  const onTag = (item: ReadinessItem) => {
    if (item.state === "verify") onVerify();
    else if (item.state === "confirm" && item.key === "brand") onConfirmBrand();
    else {
      const target = FIX_FOR_KEY[item.key];
      if (target) onFix(target);
    }
  };
  const blockers = readiness?.blockers ?? [];
  const channels = readiness?.channels ?? [];
  const chain = readiness?.chain ?? ["Product", "Variants", "Inventory", "Listings", "Channels"];

  return (
    <aside aria-label="Product readiness" className="flex flex-col gap-7 w-full lg:w-[272px] border-t lg:border-t-0 lg:border-l border-[#EAEAEA] pt-6 lg:pt-0 pl-0 lg:pl-6 shrink-0">
      <div className="flex flex-col gap-4 w-full">
        <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">Product readiness</span>

        {readiness ? (
          <>
            <div className="text-[18px] font-semibold text-[#000000] leading-[145%]" aria-live="polite">
              {readiness.percent}% complete
            </div>
            <div role="progressbar" aria-label="Product readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percent} className="w-full h-[3px] bg-[#EAEAEA] rounded-full overflow-hidden">
              <div className={`h-full bg-[#000000] transition-all duration-300 ${loading ? "opacity-60" : ""}`} style={{ width: `${readiness.percent}%` }} />
            </div>

            <div className="text-[12px] font-semibold text-[#000000] leading-[145%] pt-1">Required</div>
            <ul className="flex flex-col gap-2.5 w-full" aria-label="Required">
              {readiness.required.map((i) => (
                <Row key={i.key} item={i} onTag={onTag} />
              ))}
            </ul>

            <div className="text-[12px] font-semibold text-[#000000] leading-[145%] pt-2">Recommended</div>
            <ul className="flex flex-col gap-2.5 w-full" aria-label="Recommended">
              {readiness.recommended.map((i) => (
                <Row key={i.key} item={i} onTag={onTag} />
              ))}
            </ul>

            {readiness.hints.map((h) => (
              <p key={h} className="text-[11px] text-[#666666] leading-[145%] pt-1">
                {h}
              </p>
            ))}

            <div className="w-full h-[1px] bg-[#EAEAEA] my-1" />

            <div className="flex flex-col gap-2 w-full">
              {blockers.length ? (
                <>
                  <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">
                    {blockers.length} {blockers.length === 1 ? "issue" : "issues"} blocking publication
                  </span>
                  {blockers.map((b) => (
                    <div key={b.key} className="flex flex-col gap-1.5">
                      <p className="text-[11px] text-[#666666] leading-[145%]">{b.message}</p>
                      <button type="button" onClick={() => onFix(b.fixTarget)} className={`${outlineButton} w-[84px]`} aria-label={`Fix issue: ${b.message}`}>
                        Fix issue
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">No issues blocking publication</span>
              )}
            </div>
          </>
        ) : (
          <p role="status" className="text-[12px] text-[#666666]">
            Calculating readiness...
          </p>
        )}
      </div>

      <div className="w-full h-[1px] bg-[#EAEAEA]" />

      <div className="flex flex-col gap-3 w-full">
        <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Where this information goes</span>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">Master Product</span>
          <div className="text-[12px] text-[#666666] flex items-center">
            <ArrowDown className="w-3.5 h-3.5 text-[#666666]" aria-hidden />
          </div>
          {channels.length ? (
            <span className="text-[11px] font-medium text-[#000000] leading-[145%]">{channels.map((c) => c.name).join(" · ")}</span>
          ) : (
            <span className="text-[11px] text-[#666666] leading-[145%]">
              No sales channel is connected yet.{" "}
              <Link to={ROUTES.MARKETPLACE_HUB} className="underline text-[#000000]">
                Connect a channel
              </Link>
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#666666] leading-[145%]">Core product information can be inherited by connected listings. Marketplace-specific content can be customized later.</p>
        <ol className="text-[11px] text-[#666666] leading-[145%] pt-1 flex items-center flex-wrap gap-1" aria-label="Product creation steps">
          {chain.map((step, i) => (
            <li key={step} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>→</span> : null}
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

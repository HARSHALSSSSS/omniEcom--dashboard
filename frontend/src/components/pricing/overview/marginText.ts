import { bpsText } from "@/components/pricing/pricingFormat";
import { formatINR } from "@/utils/format";

export const DASH = "—";

/** a margin in basis points as "29.9%"; a dash when it is unknown (no cost price), never a guess */
export const marginText = (bps: number | null | undefined): string => (bps === null || bps === undefined ? DASH : bpsText(bps));

/** money from integer minor units; a dash when unknown */
export const moneyText = (minor: number | null | undefined): string => (minor === null || minor === undefined ? DASH : formatINR(minor));

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PricingTierDialog } from "./PricingTierDialog";
import type { PricingTierConfig } from "@/types/settings";

afterEach(() => cleanup());

const TIER: PricingTierConfig = {
  id: "tier-1",
  channelName: "Shopify D2C Storefront",
  channelCode: "SHOPIFY",
  baseMarkupPercent: 10,
  fixedFeeBufferInr: 0,
  hardUndercutFloorInr: 0,
  maxDiscountDepthPercent: 20,
  repriceIntervalMinutes: 60,
  minNetMarginPercent: 12,
  autoDelistOnBreach: false,
  dealFloorInr: 0,
  mandate2faForMarkdown: false,
  status: "active",
};

describe("PricingTierDialog", () => {
  it("renders nothing while closed and opens later without breaking the order of hooks", () => {
    const props = { onClose: vi.fn(), onSave: vi.fn() };
    const view = render(<PricingTierDialog tier={null} open={false} {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerender(<PricingTierDialog tier={TIER} open {...props} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Shopify D2C Storefront/)).toBeInTheDocument();
    view.rerender(<PricingTierDialog tier={TIER} open={false} {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

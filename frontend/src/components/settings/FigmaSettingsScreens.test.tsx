import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeneralTab } from "./GeneralTab";
import { InventoryListingsTab } from "./InventoryListingsTab";
import { PricingMarginsTab } from "./PricingMarginsTab";
import { PricingTierDialog } from "./PricingTierDialog";

describe("Figma Settings Screens", () => {
  describe("GeneralTab (General setting.png)", () => {
    it("renders workspace preferences and guardrails", () => {
      render(<GeneralTab canWrite={true} />);
      expect(screen.getByText("Workspace Identity & Localization")).toBeInTheDocument();
      expect(screen.getByLabelText("Workspace Display Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Default Landing Page")).toBeInTheDocument();
      expect(screen.getByText("Consequential Action Guardrails")).toBeInTheDocument();
      expect(
        screen.getByText("Require Confirmation for Bulk Status Changes"),
      ).toBeInTheDocument();
    });

    it("renders reset defaults and protection active badge", () => {
      render(<GeneralTab canWrite={true} />);
      expect(screen.getAllByText("Reset Defaults")[0]).toBeInTheDocument();
      expect(screen.getByText("PROTECTION ACTIVE")).toBeInTheDocument();
    });
  });

  describe("InventoryListingsTab (Business and regional setting-1.png & setting-2.png)", () => {
    it("renders auto-SKU formula builder, statutory listing gates and buffer matrix", () => {
      render(<InventoryListingsTab canWrite={true} />);
      expect(screen.getByText("Section 01: Catalog & Listing Gates")).toBeInTheDocument();
      expect(screen.getByText("Auto-SKU Syntax Formula")).toBeInTheDocument();
      expect(screen.getByText("Mandatory Indian Listing Compliance Gates")).toBeInTheDocument();
      expect(screen.getByText("HSN Code (6-8 Digits)")).toBeInTheDocument();
      expect(screen.getByText("Country of Origin (COO)")).toBeInTheDocument();
      expect(screen.getByText("GST Rate Slab (0/5/12/18/28%)")).toBeInTheDocument();
      expect(
        screen.getByText("Section 02: Multi-Channel Inventory Buffers & Safety Stock"),
      ).toBeInTheDocument();
      expect(screen.getByText("Shopify D2C Storefront")).toBeInTheDocument();
      expect(screen.getByText("Amazon India (FBA / MFN)")).toBeInTheDocument();
      expect(screen.getByText("Fulfillment Hub Priority Hierarchy")).toBeInTheDocument();
    });
  });

  describe("PricingMarginsTab (Business and regional setting-3.png)", () => {
    it("renders gross margin floor, live unit economics calculator and pricing tiers table", () => {
      render(<PricingMarginsTab canWrite={true} />);
      expect(
        screen.getByText("Section 01: Gross Margin Safety Floor & Live Unit Economics Simulator"),
      ).toBeInTheDocument();
      expect(screen.getByText("Live Unit Economics Breakdown")).toBeInTheDocument();
      expect(screen.getByText("Reverse GST Deduction (18% inclusive):")).toBeInTheDocument();
      expect(screen.getByText("E-Comm TCS (1%) & TDS 194-O (0.1%):")).toBeInTheDocument();
      expect(
        screen.getByText("Section 02: Multi-Channel Marketplace Pricing Tiers & Parity Rules"),
      ).toBeInTheDocument();
      expect(screen.getByText("Amazon India (SP-API)")).toBeInTheDocument();
      expect(screen.getByText("Legal Metrology MRP Compliance Gate")).toBeInTheDocument();
    });
  });

  describe("PricingTierDialog (Background+Border+Shadow.png)", () => {
    const mockTier = {
      id: "tier-amazon",
      channelName: "Amazon India (SP-API)",
      channelCode: "AMZN_IN",
      baseMarkupPercent: 8.5,
      fixedFeeBufferInr: 45,
      hardUndercutFloorInr: 1149,
      maxDiscountDepthPercent: 25,
      repriceIntervalMinutes: 15,
      minNetMarginPercent: 22.0,
      autoDelistOnBreach: true,
      dealFloorInr: 1099,
      mandate2faForMarkdown: true,
      status: "active" as const,
    };

    it("renders Parts A, B, C, D and handles save", () => {
      const handleSave = vi.fn();
      const handleClose = vi.fn();

      render(
        <PricingTierDialog
          tier={mockTier}
          open={true}
          onClose={handleClose}
          onSave={handleSave}
        />,
      );

      expect(screen.getByText("Configure Pricing Tier: Amazon India (SP-API)")).toBeInTheDocument();
      expect(screen.getByText("Part A: Formula Architecture")).toBeInTheDocument();
      expect(screen.getByText("Part B: Dynamic Buy Box & Repricing Guardrails")).toBeInTheDocument();
      expect(screen.getByText("Part C: Margin Floor & Delisting Circuit Breaker")).toBeInTheDocument();
      expect(screen.getByText("Part D: Promotion & Deal Safeguards")).toBeInTheDocument();

      const saveBtn = screen.getByRole("button", { name: /Save Pricing Tier/i });
      fireEvent.click(saveBtn);
      expect(handleSave).toHaveBeenCalledWith(expect.objectContaining({ channelCode: "AMZN_IN" }));
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

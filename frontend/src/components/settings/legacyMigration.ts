import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings.api";
import { useCan } from "@/hooks/useCan";
import { SETTINGS_KEYS } from "@/hooks/useSettings";
import type { CatalogView, PriceEnding, SettingsOverview, SettingsPatch } from "@/types/settings";
import { LANDING_OPTIONS } from "./GeneralTab";
import { PREFERENCE_DEFAULTS } from "./form";

/** where these tabs kept their values before the server did */
export const LEGACY_KEYS = ["omni_general_prefs", "omni_listing_gates", "omni_channel_buffers", "omni_pricing_margins_settings"] as const;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const int = (v: unknown, min: number, max: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined);
const pick = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find((x) => x === v);
const clean = <T extends Raw>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(v && typeof v === "object" && Object.keys(v as Raw).length === 0))) as T;

/** the server still holds only defaults for these groups, so the old browser values may move over without overwriting anyone's choice */
const prefsAreDefault = (s: SettingsOverview) =>
  JSON.stringify({ ...s.preferences, guardrails: undefined }) === JSON.stringify({ ...PREFERENCE_DEFAULTS, guardrails: undefined }) && Object.values(s.preferences.guardrails).every(Boolean);
const catalogIsDefault = (s: SettingsOverview) =>
  s.catalog.skuTemplate === "[BRAND]-[CAT3]-[SEQ6]" && s.catalog.skuSeparator === "-" && s.catalog.skuCasing === "uppercase" && !s.catalog.strictEan && !Object.values(s.catalog.gates).some(Boolean) && s.catalog.syncSovereignty === "master_catalog";
const inventoryIsDefault = (s: SettingsOverview) => s.inventory.minSafetyStockUnits === 0 && s.inventory.spikeProtectionUnitsPerHour === 200 && !s.inventory.negativeStockTwoStepApproval;
const pricingIsDefault = (s: SettingsOverview) =>
  s.pricing.marginFloorBps === null && s.pricing.maxVelocityShiftBps === 1500 && s.pricing.withholdBufferBps === 0 && s.pricing.legalMetrologyMrpGate && s.pricing.priceEnding === (s.operations.roundPriceToNine ? "nine" : "exact") && Object.keys(s.pricing.channelTiers).length === 0;

/** the PATCH that carries the old browser values to the server (only the groups the server has not been given yet); null when there is nothing to move */
export function legacyPatch(raw: Partial<Record<(typeof LEGACY_KEYS)[number], unknown>>, s: SettingsOverview): SettingsPatch | null {
  const patch: SettingsPatch = {};

  const g = obj(raw.omni_general_prefs);
  if (Object.keys(g).length && prefsAreDefault(s)) {
    const view: CatalogView | undefined = g.catalogScope === "single_hub" ? "primary_warehouse" : pick(["all_active", "low_stock"] as const, g.catalogScope);
    const telemetry = typeof g.telemetryFrequency === "string" ? Number.parseInt(g.telemetryFrequency, 10) : undefined;
    const prefs = clean({
      defaultRoute: LANDING_OPTIONS.find((o) => o.value === g.defaultRoute)?.value,
      language: pick(["en-IN", "en-US", "en-GB"] as const, g.language),
      pageSize: [10, 25, 50, 100].find((n) => n === g.pageSize),
      catalogView: view,
      reportingPeriod: pick(["7d", "30d", "qtd", "fytd"] as const, g.reportingPeriod),
      telemetrySeconds: [15, 30, 60].find((n) => n === telemetry),
      showThumbnails: bool(g.showThumbnails),
      guardrails: clean({ bulkConfirm: bool(g.guardrailBulk), stockAllocationConfirm: bool(g.guardrailStock), zeroStockDelistWarning: bool(g.guardrailDelist) }),
    });
    if (Object.keys(prefs).length) patch.preferences = prefs;
  }

  const gates = obj(raw.omni_listing_gates);
  if (Object.keys(gates).length && catalogIsDefault(s)) {
    const mg = obj(gates.mandatoryGates);
    const template = typeof gates.skuSyntaxTemplate === "string" && gates.skuSyntaxTemplate.trim().length > 0 && gates.skuSyntaxTemplate.length <= 60 ? gates.skuSyntaxTemplate.trim() : undefined;
    const catalog = clean({
      skuTemplate: template,
      skuSeparator: pick(["-", "_", "/"] as const, gates.skuSeparator),
      skuCasing: pick(["uppercase", "lowercase", "as_is"] as const, gates.skuCasing),
      strictEan: bool(gates.strictEanValidation),
      gates: clean({ hsnCode: bool(mg.hsnCode), countryOfOrigin: bool(mg.countryOfOrigin), gstRateSlab: bool(mg.gstRateSlab) }),
      syncSovereignty: pick(["master_catalog", "channel_autonomous"] as const, gates.syncSovereignty),
    });
    if (Object.keys(catalog).length) patch.catalog = catalog;
  }

  const buf = obj(raw.omni_channel_buffers);
  if (Object.keys(buf).length && inventoryIsDefault(s)) {
    const inventory = clean({ minSafetyStockUnits: int(buf.minSafetyStockUnits, 0, 1_000_000), spikeProtectionUnitsPerHour: int(buf.spikeProtectionUnitsPerHour, 1, 1_000_000), negativeStockTwoStepApproval: bool(buf.negativeStockTwoStepApproval) });
    if (Object.keys(inventory).length) patch.inventory = inventory;
  }

  const pr = obj(raw.omni_pricing_margins_settings);
  if (Object.keys(pr).length && pricingIsDefault(s)) {
    const floor = typeof pr.grossMarginFloorPercent === "number" ? int(Math.round(pr.grossMarginFloorPercent * 100), 0, 10_000) : undefined;
    const shift = typeof pr.maxVelocityShiftPercent === "number" ? int(Math.round(pr.maxVelocityShiftPercent * 100), 0, 10_000) : undefined;
    const ending: PriceEnding | undefined = pr.psychologicalEnding === "9" ? "nine" : pr.psychologicalEnding === "0" ? "zero" : pick(["exact"] as const, pr.psychologicalEnding);
    const pricing = clean({
      marginFloorBps: floor,
      maxVelocityShiftBps: shift,
      priceEnding: ending,
      legalMetrologyMrpGate: bool(pr.legalMetrologyMrpGate),
      withholdBufferBps: bool(pr.withholdTcsTdsBuffer) === undefined ? undefined : pr.withholdTcsTdsBuffer ? 110 : 0,
    });
    if (Object.keys(pricing).length) patch.pricing = pricing;
  }

  return Object.keys(patch).length ? patch : null;
}

const read = (): Partial<Record<(typeof LEGACY_KEYS)[number], unknown>> => {
  const out: Partial<Record<(typeof LEGACY_KEYS)[number], unknown>> = {};
  for (const k of LEGACY_KEYS) {
    try {
      const item = localStorage.getItem(k);
      if (item) out[k] = JSON.parse(item);
    } catch {
      // unreadable storage or a broken value: nothing to move
    }
  }
  return out;
};
const clear = () => {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      // storage may be blocked
    }
  }
};

/**
 * Once per load of the Settings screen: values these tabs used to keep only in this browser move to the server (when the server still
 * has defaults for that group), then the browser copies are removed so nobody loses a setting and nothing is applied twice.
 * Only someone who can change settings runs it; a failed save leaves the browser copies for the next try.
 */
export function useLegacySettingsMigration(settings: SettingsOverview | undefined) {
  const canWrite = useCan("vendors:write");
  const qc = useQueryClient();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !settings || !canWrite) return;
    done.current = true;
    const raw = read();
    if (Object.keys(raw).length === 0) return;
    const patch = legacyPatch(raw, settings);
    if (!patch) {
      clear();
      return;
    }
    void settingsApi
      .save({ ...patch, version: settings.version })
      .then((next) => {
        qc.setQueryData(SETTINGS_KEYS.overview, next);
        clear();
      })
      .catch(() => {
        done.current = false;
      });
  }, [settings, canWrite, qc]);
}

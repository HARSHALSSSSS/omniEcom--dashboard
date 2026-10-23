import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Lock, SlidersHorizontal, History, AlertTriangle } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useCatalogStats } from "@/hooks/useProducts";
import { useConnectorReadiness } from "@/hooks/useDirectory";
import { formatNumber } from "@/utils/format";
import { entitySync } from "@/api/connectors.api";
import { HubAccountActions } from "@/components/marketplace-hub/accounts/HubAccountActions";
import { useAccountActions } from "@/components/marketplace-hub/accounts/useAccountActions";
import { ago, tokenText, TAG_LABEL, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import {
  FEE_NOTE,
  FEE_TEXT,
  dataStreams,
  loadBookmarks,
  saveBookmarks,
  tagsFromEnabled,
  type CapStatus,
} from "@/pages/marketplace-hub/components/connectorFacts";
import type { ConnectorInfo, HubAccountCard, HubAccountDetail } from "@/types/hub";
import { CapabilityRadialGraph, type CapabilityKey } from "./CapabilityRadialGraph";
import { ConnectConfirmationModal } from "./ConnectConfirmationModal";

type ViewState = "available" | "connected" | "paused" | "attention";

interface ModernConnectorDetailViewProps {
  connector: ConnectorInfo;
  /** the business's main account of this connector (the detail when loaded, else the card) */
  account?: HubAccountCard | HubAccountDetail | null;
  /** every account of this connector */
  accounts?: HubAccountCard[] | null;
  /** accounts of the other connectors (the "today" column) */
  otherAccounts?: HubAccountCard[] | null;
}

const CAP_LABEL: Record<CapabilityKey, string> = {
  catalog: "Product import",
  listings: "Listings",
  inventory: "Inventory sync",
  orders: "Orders",
  shipping: "Shipping",
  returns: "Returns",
  reviews: "Reviews",
  promotions: "Promotions",
};
const CAP_TAG: Record<CapabilityKey, string | null> = {
  catalog: "product_import",
  listings: "listings",
  inventory: "inventory",
  orders: "orders",
  shipping: "shipping",
  returns: "returns",
  reviews: null, // no connector synchronizes reviews
  promotions: "promotions",
};
const CAP_KEYS = Object.keys(CAP_LABEL) as CapabilityKey[];

const ENTITY_STATE_TEXT = { healthy: "Active", syncing: "Syncing", warning: "Done with errors", error: "Failed", idle: "Waiting for a run" } as const;

/** Reconnect needs the account's own dialog (credential fields of the connector), so it is a component of its own. */
function ReconnectAction({ account, className, children }: { account: HubAccountCard; className: string; children: ReactNode }) {
  const a = useAccountActions(account);
  return (
    <>
      <button type="button" disabled={!a.canWrite} title={a.canWrite ? undefined : WRITE_REASON} onClick={() => a.openDialog("reconnect")} className={className}>
        {children}
      </button>
      {a.dialogs}
    </>
  );
}

export function ModernConnectorDetailView({ connector, account, accounts = null, otherAccounts = null }: ModernConnectorDetailViewProps) {
  const navigate = useNavigate();
  const canWrite = useCan("marketplace_accounts:write");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saved, setSaved] = useState(() => loadBookmarks().includes(connector.code));

  const { data: readiness } = useConnectorReadiness(connector.code);
  const { data: stats } = useCatalogStats({});

  // ---- capabilities: the connector's real flags, grouped like the directory chips
  const enabled = connector.enabledCapabilities ?? [];
  const tags = tagsFromEnabled(enabled);
  const partner = Boolean(connector.authFlow?.partnerGated);
  const capStatus = (k: CapabilityKey): CapStatus => {
    const tag = CAP_TAG[k];
    if (!tag || !tags.includes(tag)) return "unavailable";
    return partner ? "depends" : "supported";
  };
  const statuses = Object.fromEntries(CAP_KEYS.map((k) => [k, capStatus(k)])) as Record<CapabilityKey, CapStatus>;
  const supportedLabels = tags.map((t) => TAG_LABEL[t] ?? t);
  const streams = dataStreams(enabled);
  const limits = connector.capabilities?.limits as { requestsPerSecond?: number; burst?: number } | undefined;
  const orderWebhook = Boolean((connector.capabilities?.orders as { webhook?: boolean } | undefined)?.webhook);

  // ---- state of the business's account
  const planned = connector.implementation === "planned";
  const accountStatus = account?.accountStatus;
  const state: ViewState = !account
    ? "available"
    : accountStatus === "revoked" || accountStatus === "pending_authorization"
      ? "attention"
      : accountStatus === "paused"
        ? "paused"
        : account.status === "warning" || account.status === "error"
          ? "attention"
          : "connected";
  const isNeedsAttention = state === "attention";
  const isAvailable = state === "available";
  const needsReconnect = Boolean(account) && accountStatus !== "active" && accountStatus !== "paused";

  const statusHeadline = state === "connected" ? "✓ CONNECTED" : state === "paused" ? "Ⅱ PAUSED" : isNeedsAttention ? "! Needs attention" : "O Available to connect";
  const statusColor = state === "connected" ? "text-[#16A34A]" : isNeedsAttention ? "text-[#D97706]" : "text-[#737373]";

  const frictionPoints = account?.health?.frictionPoints ?? [];
  const primaryIssue = frictionPoints[0] ?? (isNeedsAttention ? "The connection needs attention" : undefined);
  const lastSync = account?.lastSyncAt ? ago(account.lastSyncAt) : "Never";
  const token = account ? tokenText(account) : null;

  // ---- readiness stepper: every step is a fact about the account
  const detail = account && "recentJobs" in account ? account : null;
  const stepsDone = [true, Boolean(account), accountStatus === "active" || accountStatus === "paused", Boolean(account?.lastSyncAt), state === "connected"];
  const doneCount = stepsDone.filter(Boolean).length;
  const hasProducts = stats?.products;

  const manage = () => navigate(account ? `${ROUTES.MARKETPLACE_HUB}?q=${encodeURIComponent(account.name)}` : ROUTES.MARKETPLACE_HUB);
  const startConnect = () => (isAvailable ? setShowConfirmModal(true) : navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${connector.code}`));
  const connectDisabled = planned || !canWrite;
  const scrollToCapabilities = () => document.getElementById("capabilities-section")?.scrollIntoView({ behavior: "smooth" });
  const toggleSaved = () => {
    const cur = loadBookmarks();
    const next = cur.includes(connector.code) ? cur.filter((c) => c !== connector.code) : [...cur, connector.code];
    saveBookmarks(next);
    setSaved(next.includes(connector.code));
  };

  const primaryClass = "h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors flex items-center justify-center text-center cursor-pointer disabled:bg-[#F5F5F5] disabled:text-[#666666] disabled:cursor-not-allowed";
  const outlineClass = "h-9 px-4 rounded-lg border border-[#666666] bg-[#FFFFFF] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors";
  const linkClass = "text-[12px] font-semibold leading-[17px] text-[#000000] hover:underline whitespace-nowrap self-center shrink-0 disabled:opacity-50";

  const requestLimit = limits?.requestsPerSecond ? `${limits.requestsPerSecond} requests/s, burst ${limits.burst ?? "-"}` : "Not stated";
  const environment = readiness ? (readiness.live && readiness.sandbox ? "Sandbox and live" : readiness.live ? "Live" : readiness.sandbox ? "Sandbox only" : "Not verified yet") : "Loading...";

  return (
    <div className="w-full space-y-8 pb-24 text-[#000000] font-['Inter',sans-serif] animate-in fade-in duration-150">
      {/* 1. HEADER */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-12 items-stretch border-b border-[#EAEAEA] pb-7 pt-2 w-full">
          <div className="w-full space-y-2.5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#F5F5F5] border border-[#EAEAEA] flex items-center justify-center font-semibold text-[26px] leading-[38px] text-[#000000] flex-none">
                {connector.displayName.charAt(0)}
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">{connector.category} CONNECTOR</span>
                <div className="flex items-center gap-2">
                  <h2 className="text-[36px] font-semibold leading-[120%] text-[#000000] m-0">{connector.displayName}</h2>
                  {planned && <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F5F5F5] text-[#666666] border border-[#EAEAEA]">Coming soon</span>}
                  {connector.implementation === "beta" && <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">Beta</span>}
                </div>
              </div>
            </div>

            <p className="text-[14px] leading-[20px] text-[#000000]">{connector.description}</p>

            <div className="space-y-1 pt-0.5">
              <div className="flex items-center gap-4 text-[12px] leading-[17px]">
                <span className={`font-semibold ${statusColor}`}>{statusHeadline}</span>
                <span className="text-[#666666]">
                  Category · <span className="capitalize">{connector.category}</span>
                </span>
                <span className="text-[#666666]">Regions · {connector.supportedRegions.join(", ") || "Not stated"}</span>
              </div>
              {isNeedsAttention && (
                <div className="rounded-lg border border-[#D97706]/20 bg-[#FFFBEB] p-3 text-[12px] text-[#B45309] space-y-1 mt-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{primaryIssue}</span>
                  </div>
                  {frictionPoints.slice(1).map((f) => (
                    <div key={f} className="text-[11px] text-[#92400E]">{f}</div>
                  ))}
                  <div className="text-[11px] text-[#92400E]">Last successful sync: {account?.lastSyncAt ? lastSync : "Not recorded"}</div>
                </div>
              )}

              <div className="pt-2 border-t border-[#EAEAEA] flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] leading-[16px] text-[#666666]">
                {account ? (
                  <>
                    <span>
                      Connection health: <span className="font-semibold text-[#000000]">{account.health.pulseScore}%</span>
                    </span>
                    <span>
                      Last sync: <span className="font-semibold text-[#000000]">{lastSync}</span>
                    </span>
                    {token && <span className={token.tone === "bad" ? "text-red-600" : token.tone === "warn" ? "text-[#D97706]" : ""}>{token.text}</span>}
                  </>
                ) : (
                  <>
                    <span>Review the connection before authorizing</span>
                    <button type="button" onClick={scrollToCapabilities} className="font-semibold text-[12px] text-[#000000] hover:underline">
                      View capabilities ↓
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-full pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between w-full">
              <div className="shrink-0">
                <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">Your business</div>
                <div className="text-[11px] font-normal leading-[16px] text-[#666666]">Central workspace</div>
              </div>
              <div className="flex-1 flex flex-col items-center px-4">
                <span className="text-[10px] leading-[15px] text-[#666666]">
                  {state === "connected" ? "Connected → Active" : state === "paused" ? "Connected → Paused" : isNeedsAttention ? (needsReconnect ? "Disconnected → Reconnect" : "Connected → Review") : "Review → Authorize"}
                </span>
                <div className="w-full h-[1px] bg-[#BDBDBD] mt-1" />
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">{connector.displayName}</div>
                <div className="text-[11px] font-normal leading-[16px] text-[#666666] capitalize">{connector.category}</div>
              </div>
            </div>

            <div className="text-[10px] leading-[15px] text-[#666666]">{supportedLabels.length > 0 ? supportedLabels.join(" · ") : "No capabilities enabled yet"}</div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span title={connectDisabled ? (planned ? "This integration is not available yet" : WRITE_REASON) : undefined}>
                <button type="button" aria-label="Connect" disabled={connectDisabled} onClick={startConnect} className={primaryClass}>
                  {isAvailable ? `Connect ${connector.displayName}` : "Connect another account"}
                </button>
              </span>
              {needsReconnect && account && (
                <ReconnectAction account={account} className={outlineClass}>
                  Reconnect
                </ReconnectAction>
              )}
              {account && (
                <button type="button" onClick={manage} className={outlineClass}>
                  Manage
                </button>
              )}
              <button type="button" aria-pressed={saved} onClick={toggleSaved} className={outlineClass}>
                {saved ? "Saved" : "Save connector"}
              </button>
            </div>

            <div className="space-y-1 pt-1 text-[11px] leading-[16px] text-[#666666]">
              <span className="font-semibold text-[12px] leading-[17px] text-[#000000] block">Connecting does not publish products automatically.</span>
              <p>You can review mapping, synchronization and listing settings before activating marketplace workflows.</p>
              <p className="pt-0.5">
                {account ? "Manage mappings, permissions and synchronization from this workspace." : "No authorization has been granted. Account access is confirmed during setup."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CAPABILITIES AND EXCHANGE */}
      <div id="capabilities-section" className="space-y-6 pt-2 w-full">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start w-full">
          <div className="xl:col-span-7 space-y-2 w-full">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">What can this connection do?</h2>
              <span className="text-[10px] leading-[15px] text-[#666666]">✓ Supported &nbsp; ◑ Depends &nbsp; — Not available</span>
            </div>
            <CapabilityRadialGraph connectorName={connector.displayName} statuses={statuses} />
            <p className="text-[11px] leading-[16px] text-[#666666] pt-1">
              {partner ? "This marketplace gives API access only to approved partners, so every capability depends on that approval." : "Availability may vary by connector permissions or marketplace support."}
            </p>
          </div>

          <div className="xl:col-span-5 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-4 w-full">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">What comes across</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { title: "INTO THE PLATFORM", glyph: "↓", items: streams.into, foot: "Marketplace → Workspace" },
                { title: "FROM THE PLATFORM", glyph: "↑", items: streams.from, foot: "Workspace → Marketplace" },
                { title: "CONTROLLED BY YOU", glyph: "○", items: ["Pricing", "Publishing", "Commercial decisions"], foot: "Merchant decisions" },
              ].map((col) => (
                <div key={col.title} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-1 text-[10px] leading-[15px] text-[#666666] uppercase">
                    <span>{col.title}</span>
                  </div>
                  <div className="text-[26px] font-semibold leading-[38px] text-[#000000]">{col.glyph}</div>
                  <div className="flex flex-col">
                    {col.items.length === 0 && <div className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#A3A3A3]">Nothing yet</div>}
                    {col.items.map((it) => (
                      <div key={it} className="py-2 border-t border-[#EAEAEA] text-[12px] leading-[17px] text-[#000000]">
                        {it}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] leading-[15px] text-[#666666] pt-1">{col.foot}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-[16px] text-[#666666] border-t border-[#EAEAEA] pt-3">
              {orderWebhook ? "Order events are pushed by the marketplace and also polled." : "Orders are polled from the marketplace on a schedule."} Data exchange is conditional on actual supported integration.
            </p>
          </div>
        </div>

        <div className="border-t border-[#EAEAEA] pt-3 space-y-3 w-full">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">THE COMMERCE WORKFLOW</span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { name: "Master Product", arrow: "→", text: "Your centralized product information." },
              { name: `${connector.displayName} Listing`, arrow: "→", text: "Marketplace-specific representation." },
              { name: "Inventory Sync", arrow: "→", text: "Available stock synchronization." },
              { name: "Order Sync", arrow: "→", text: "Orders enter the central workflow." },
              { name: "Central Operations", arrow: "↗", text: "Fulfillment, exceptions and daily operations in one workspace." },
            ].map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-[12px] font-semibold leading-[17px] text-[#000000]">
                  <span>{s.name}</span>
                  <span>{s.arrow}</span>
                </div>
                <div className="w-full h-[1px] bg-[#BDBDBD]" />
                <p className="text-[11px] leading-[16px] text-[#666666]">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. READINESS TRACK */}
      <div className="border-t border-[#EAEAEA] pt-4 space-y-3 w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">
            {state === "connected" ? "Connection is live" : state === "paused" ? "Syncing is paused" : isNeedsAttention ? "Restore your connection" : "Ready to connect"}
          </h2>
          <span className="text-[12px] leading-[17px] text-[#666666]">{doneCount} of 5 steps complete</span>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
              {["Connector selected", "Account access", "Authorization", "Initial sync", "Live"].map((label, i) => {
                const done = stepsDone[i];
                const warn = isNeedsAttention && !done && i === 2;
                return (
                  <div key={label} className="flex items-center gap-2" data-done={done}>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] leading-[15px] ${
                        warn ? "bg-[#D97706] border border-[#D97706] text-white" : done ? (i === 4 ? "bg-[#16A34A] border border-[#16A34A] text-white" : "bg-[#000000] border border-[#000000] text-white") : "bg-white border border-[#BDBDBD] text-[#000000]"
                      }`}
                    >
                      {warn ? "!" : done ? "✓" : "○"}
                    </div>
                    <span className="text-[12px] leading-[17px] text-[#000000]">{label}</span>
                    {i < 4 && <div className="flex-1 h-[1px] bg-[#EAEAEA] hidden sm:block" />}
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] leading-[16px] text-[#666666]">
              {state === "connected"
                ? `Active connection · ${supportedLabels.join(", ").toLowerCase() || "no capabilities"} synchronizing.`
                : state === "paused"
                  ? "Syncing is paused for this account. Resume it from Manage."
                  : isNeedsAttention
                    ? needsReconnect
                      ? "The account is disconnected · reconnect it to resume syncing."
                      : "Attention needed · check the issues above and retry the sync."
                    : "Ready to authorize · confirm account access before authorization."}
            </div>
          </div>

          {isAvailable ? (
            <button type="button" disabled={connectDisabled} onClick={startConnect} className={linkClass}>
              Continue →
            </button>
          ) : needsReconnect && account ? (
            <ReconnectAction account={account} className={linkClass}>
              Reconnect →
            </ReconnectAction>
          ) : (
            <button type="button" onClick={manage} className={linkClass}>
              Manage →
            </button>
          )}
        </div>
      </div>

      {/* 4. CONSOLIDATION AND RATIONALE */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 xl:grid-cols-12 gap-10 w-full">
        <div className="xl:col-span-7 space-y-4 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">What changes after connection</h2>
          <div className="flex items-start gap-6 pt-1">
            <div className="w-[190px] space-y-3 flex-none">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">TODAY</span>
              <div className="space-y-1">
                {(otherAccounts ?? []).slice(0, 4).map((a, i) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[#EAEAEA] text-[12px] leading-[17px]">
                    <span className="font-semibold text-[#000000]">{a.name}</span>
                    <span className="text-[#666666]">{["↘", "→", "↗", "→"][i % 4]}</span>
                  </div>
                ))}
                {(otherAccounts ?? []).length === 0 && <div className="py-1.5 text-[12px] leading-[17px] text-[#666666]">No other channel connected yet.</div>}
              </div>
              <p className="text-[11px] leading-[16px] text-[#666666]">Products managed across multiple systems.</p>
            </div>

            <div className="w-16 h-36 flex items-center justify-center text-[18px] font-semibold text-[#000000] flex-none">→</div>

            <div className="flex-1 pl-6 border-l-2 border-[#000000] space-y-3">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">AFTER</span>
              <div className="space-y-1">
                <h3 className="text-[26px] font-semibold leading-[38px] text-[#000000] m-0">One workspace</h3>
                <div className="flex flex-wrap items-center gap-4 text-[12px] font-semibold leading-[17px] text-[#000000]">
                  <span>Product</span>
                  <span>Inventory</span>
                  <span>Orders</span>
                  <span>Listings</span>
                </div>
              </div>
              <p className="text-[11px] leading-[16px] text-[#666666]">Your master catalog stays central. Marketplace-specific needs remain at the listing layer.</p>
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-3 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Why this connector may matter</h2>
          <div className="space-y-3">
            {[
              { n: "01", t: "Centralize", d: "Bring supported marketplace activity into one workspace." },
              { n: "02", t: "Reduce duplicate work", d: "Reuse master product information instead of recreating everything manually." },
              { n: "03", t: "Stay operationally visible", d: "Monitor synchronization and connection health from the commerce workspace." },
            ].map((r) => (
              <div key={r.n} className="border-t border-[#EAEAEA] pt-3 flex items-start gap-3.5">
                <span className="text-[10px] leading-[15px] text-[#666666] font-mono">{r.n}</span>
                <div>
                  <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">{r.t}</h3>
                  <p className="text-[11px] leading-[16px] text-[#666666] mt-1">{r.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. COVERAGE, ACCESS, PREREQUISITES */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        <div className="lg:col-span-4 space-y-3 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Capability coverage</h2>
          <div className="border-t border-b border-[#EAEAEA] divide-y divide-[#EAEAEA]">
            <div className="flex items-center justify-between py-2 text-[11px] leading-[16px] text-[#666666]">
              <span>Capability</span>
              <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">{connector.displayName}</span>
            </div>
            {CAP_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between py-1.5 text-[12px] leading-[17px]">
                <span className="text-[#000000]">{CAP_LABEL[k]}</span>
                <span className="text-[#666666]">{statuses[k] === "supported" ? "✓ Supported" : statuses[k] === "depends" ? "◑ Depends" : "— Not available"}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-[16px] text-[#666666]">Support depends on actual implementation, supported APIs and commercial/API permissions.</p>
        </div>

        <div className="lg:col-span-4 pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] space-y-4 w-full">
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Connector subscription</h2>
          <div className="space-y-2 text-[12px] leading-[17px]">
            <div className="border-b border-[#EAEAEA] pb-3">
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">YOUR WORKSPACE</span>
              <div className="text-[12px] font-semibold text-[#000000] mt-1">{FEE_TEXT}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">{connector.displayName.toUpperCase()} CONNECTOR</span>
              <div className="text-[12px] font-semibold text-[#000000] mt-1">Connector access</div>
              <p className="text-[11px] leading-[16px] text-[#666666] mt-0.5">{FEE_NOTE}</p>
            </div>
            <div className="space-y-2 pt-2">
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Connector fee</span>
                <span className="text-[12px] text-[#000000]">{FEE_TEXT}</span>
              </div>
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Request limit per account</span>
                <span className="text-[12px] text-[#000000]">{requestLimit}</span>
              </div>
              <div>
                <span className="text-[10px] leading-[15px] text-[#666666] block">Environment</span>
                <span className="text-[12px] text-[#000000]">{environment}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] space-y-4 w-full">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Before you connect</h2>
            {connector.authFlow?.mode && (
              <span className="text-[11px] text-[#666666]">
                {connector.authFlow.mode === "credentials" ? "Paste API credentials" : connector.authFlow.mode === "redirect" ? "Approve on marketplace" : "API credentials or redirect"}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-[16px] text-[#666666]">What this connector asks for during setup.</p>

          <div className="space-y-4 text-[12px]">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">01</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">{connector.displayName} seller account</h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">Confirm the account you intend to connect.</p>
                {(connector.authFlow?.fields?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[#666666]">
                    {connector.authFlow.fields.map((f) => (
                      <span key={f.key} className="bg-[#F5F5F5] px-1.5 py-0.5 rounded border border-[#EAEAEA]">
                        {f.label}
                        {f.secret ? " (kept encrypted)" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">02</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Required account access</h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  {connector.authFlow.mode === "redirect"
                    ? "Authorization is approved directly on the marketplace portal."
                    : connector.authFlow.mode === "credentials"
                      ? `API credentials required (${connector.authFlow.fields.map((f) => f.label).join(", ") || "access keys"}).`
                      : "Authorize on the marketplace or enter credentials."}
                  {partner ? " The marketplace only gives API access to approved partners." : ""}
                </p>
                {readiness?.notes && <p className="text-[11px] text-[#666666] mt-0.5">{readiness.notes}</p>}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">03</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Enabled capabilities</h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">{supportedLabels.length > 0 ? supportedLabels.join(", ") : "None enabled yet."}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-[10px] font-mono leading-[15px] text-[#666666]">04</span>
              <div>
                <h3 className="text-[12px] font-semibold leading-[17px] text-[#000000] m-0">Initial catalog sync</h3>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  {hasProducts !== undefined ? `Reconciles with ${formatNumber(hasProducts)} master products in your workspace.` : "Reconciles with the master products in your workspace."}
                </p>
              </div>
            </div>
          </div>

          {!account && <p className="text-[11px] leading-[16px] text-[#666666] pt-1">Account access and authorization are verified during setup.</p>}
        </div>
      </div>

      {/* Accounts of this connector, with every action */}
      {accounts && accounts.length > 0 && (
        <section aria-label="Your accounts" className="rounded-2xl border border-[#EDEDED] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
          <h2 className="text-[15px] font-bold text-[#111111]">Your accounts</h2>
          <div className="divide-y divide-[#F0F0F0] rounded-xl border border-[#EDEDED] overflow-hidden">
            {accounts.map((a) => (
              <div key={a.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px] bg-white hover:bg-[#FAFAFA] transition-colors">
                <div>
                  <Link to={`/marketplace-hub/connectors/${a.id}`} className="font-bold text-[#111111] hover:underline">
                    {a.name}
                  </Link>
                  <div className="text-[11px] text-[#737373]">
                    {a.accountIdentifier ? `${a.accountIdentifier} · ` : ""}Region {a.region} · {a.mode === "sandbox" ? "Sandbox · " : ""}Health {a.health.pulseScore}% · {a.accountStatus.replace(/_/g, " ")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <HubAccountActions account={a} />
                  <Link to={`/marketplace-hub/connectors/${a.id}`} className="font-semibold text-[11px] text-[#111111] hover:underline">
                    Manage account →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. SYNCHRONIZATION */}
      <div className="border-t border-[#EAEAEA] pt-6 grid grid-cols-1 xl:grid-cols-12 gap-10 w-full">
        <div className="xl:col-span-6 space-y-3.5 w-full">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">After connection</h2>
            <span className="text-[10px] leading-[15px] text-[#666666]">
              {state === "connected" ? "LIVE CONNECTION" : state === "paused" ? "SYNCING PAUSED" : isNeedsAttention ? "CONNECTION NEEDS ATTENTION" : "SYNC PREVIEW · NOT ACTIVE"}
            </span>
          </div>

          <div className="flex flex-col">
            {(
              [
                { name: "Products", entity: "products", supported: tags.includes("product_import") },
                { name: "Listings", entity: "listings", supported: tags.includes("listings") },
                { name: "Inventory", entity: "inventory", supported: tags.includes("inventory") },
                { name: "Orders", entity: "orders", supported: tags.includes("orders") },
              ] as const
            ).map((stream) => {
              const e = detail ? entitySync(detail, stream.entity) : null;
              const st = e?.status ?? "idle";
              return (
                <div key={stream.name} className="flex items-center justify-between py-2.5 border-t border-[#EAEAEA] text-[12px] leading-[17px]">
                  <span className="font-semibold text-[#000000] w-24">{stream.name}</span>
                  <div className="flex-1 flex items-center gap-3 px-3">
                    <span className="text-[11px] leading-[16px] text-[#666666]">{stream.supported ? "Ready" : "—"}</span>
                    <div className="flex-1 h-[1px] bg-[#EAEAEA]" />
                    <span className="text-[11px] leading-[16px] text-[#666666]">Sync</span>
                    <div className="flex-1 h-[1px] bg-[#EAEAEA]" />
                    <span className="text-[11px] leading-[16px] text-[#666666]">{!stream.supported ? "—" : account ? (e?.at ? ago(e.at) : st === "idle" ? "No run yet" : "Last 24 h") : "Standby"}</span>
                  </div>
                  <div className="w-32 text-right text-[11px] leading-[16px] text-[#666666]">
                    {!stream.supported ? (
                      <span className="text-[#A3A3A3]">Unavailable</span>
                    ) : !account ? (
                      <span>Not started</span>
                    ) : (
                      <span className={st === "healthy" ? "text-[#16A34A] font-medium" : st === "syncing" ? "text-[#16A34A] font-medium animate-pulse" : st === "error" ? "text-[#DC2626] font-medium" : st === "warning" ? "text-[#D97706] font-medium" : ""}>
                        {ENTITY_STATE_TEXT[st]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#EAEAEA] text-[11px] leading-[16px] text-[#666666]">
            <span>Initial sync status</span>
            <span className="text-[12px] font-semibold text-[#000000]">
              {!account ? "Not started" : account.syncState === "syncing" ? "Running" : account.lastSyncAt ? (isNeedsAttention ? "Needs review" : "Synchronized") : "Not run yet"}
            </span>
          </div>

          <p className="text-[11px] leading-[16px] text-[#666666]">
            {account
              ? account.lastSyncAt
                ? `Last sync ${lastSync}${account.nextSyncAt && state === "connected" ? ` · next ${new Date(account.nextSyncAt).getTime() > Date.now() ? "scheduled" : "due now"}` : ""}.${primaryIssue && isNeedsAttention ? ` ${primaryIssue}.` : ""}`
                : "No sync has run for this account yet."
              : "Preview only. Streams become active after authorization and your synchronization review."}
          </p>
        </div>

        <div className="xl:col-span-6 pl-0 xl:pl-8 border-t xl:border-t-0 xl:border-l border-[#EAEAEA] space-y-3.5 w-full">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase">RECOMMENDED SETUP</span>
          <div>
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Import your existing {connector.displayName} catalog first</h2>
            {stats ? (
              <>
                <p className="text-[12px] leading-[17px] text-[#666666] mt-1">{formatNumber(stats.products)} master products are already available in your workspace.</p>
                <p className="text-[11px] leading-[16px] text-[#666666]">
                  {formatNumber(stats.variants)} variants · Existing workspace catalog, not a {connector.displayName} import count.
                </p>
              </>
            ) : (
              <p className="text-[12px] leading-[17px] text-[#666666] mt-1">Your master catalog stays central.</p>
            )}
          </div>
          <div className="border-t border-b border-[#EAEAEA] py-3 space-y-1">
            <span className="text-[12px] font-semibold leading-[17px] text-[#000000] block">Review mappings before publishing</span>
            <p className="text-[11px] leading-[16px] text-[#666666]">Confirm marketplace-specific fields and synchronization settings. Importing and publishing remain deliberate choices.</p>
          </div>
          {needsReconnect && account ? (
            <ReconnectAction account={account} className={outlineClass}>
              Use recommended setup
            </ReconnectAction>
          ) : (
            <button type="button" disabled={isAvailable && connectDisabled} onClick={isAvailable ? startConnect : manage} className={`${outlineClass} disabled:opacity-50`}>
              Use recommended setup
            </button>
          )}
        </div>
      </div>

      {/* 7. SAFEGUARDS AND FACTS */}
      <div className="border-t border-[#EAEAEA] pt-6 space-y-6 w-full">
        <div className="flex flex-col lg:flex-row items-start gap-8 w-full">
          <div className="w-[300px] flex-none">
            <h2 className="text-[18px] font-semibold leading-[26px] text-[#000000] m-0">Your account stays protected</h2>
            <p className="text-[11px] leading-[16px] text-[#666666] mt-1">Connection safeguards of this platform.</p>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { Icon: ShieldCheck, t: "Secure authorization" },
              { Icon: Lock, t: "Encrypted credentials" },
              { Icon: SlidersHorizontal, t: "Controlled access" },
              { Icon: History, t: "Connection audit trail" },
            ].map(({ Icon, t }) => (
              <div key={t} className="space-y-2">
                <Icon className="w-[18px] h-[18px] text-[#666666]" />
                <div className="text-[12px] font-semibold leading-[17px] text-[#000000]">{t}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#EAEAEA] pt-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-[11px] leading-[16px]">
          <div>
            <span className="text-[#666666] block">Implementation</span>
            <span className="text-[#000000] font-normal capitalize">{connector.implementation === "ga" ? "General availability" : connector.implementation}</span>
          </div>
          <div>
            <span className="text-[#666666] block">Environment</span>
            <span className="text-[#000000] font-normal">{environment}</span>
          </div>
          <div>
            <span className="text-[#666666] block">Request limit</span>
            <span className="text-[#000000] font-normal">{requestLimit}</span>
          </div>
          <div>
            <span className="text-[#666666] block">Order events</span>
            <span className="text-[#000000] font-normal">{orderWebhook ? "Pushed by webhook" : "Polled"}</span>
          </div>
        </div>
      </div>

      {/* 8. PERSISTENT ACTIONS */}
      <div className="border-t border-[#EAEAEA] py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">
            {connector.displayName} · {state === "connected" ? "Connected" : state === "paused" ? "Paused" : isNeedsAttention ? "Needs attention" : "Available to connect"}
          </span>
          <div className="text-[10px] leading-[15px] text-[#666666]">Persistent actions · stays visible while exploring</div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)} className={outlineClass}>
            Back
          </button>
          <button type="button" aria-pressed={saved} onClick={toggleSaved} className={outlineClass}>
            {saved ? "Saved" : "Save"}
          </button>
          {needsReconnect && account ? (
            <ReconnectAction account={account} className={primaryClass}>
              Reconnect
            </ReconnectAction>
          ) : (
            <span title={isAvailable && connectDisabled ? (planned ? "This integration is not available yet" : WRITE_REASON) : undefined}>
              <button type="button" onClick={isAvailable ? startConnect : manage} disabled={isAvailable && connectDisabled} className={primaryClass}>
                {isAvailable ? `Connect ${connector.displayName}` : "Manage connection"}
              </button>
            </span>
          )}
        </div>
      </div>

      <ConnectConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        connectorName={connector.displayName}
        scopes={supportedLabels}
        onConfirm={() => navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${connector.code}`)}
      />
    </div>
  );
}

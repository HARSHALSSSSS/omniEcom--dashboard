import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useCatalogStats } from "@/hooks/useProducts";
import { useConnection } from "@/hooks/useConnectors";
import { formatNumber } from "@/utils/format";
import { ago, tokenText, WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import type { ConnectorDirectoryItem, ChannelConnection } from "@/types/connection";
import {
  CAPABILITY_ROWS,
  FEE_NOTE,
  FEE_TEXT,
  accessText,
  capabilitySupport,
  connectionSteps,
  environmentText,
  limitText,
  regionsText,
  requirementItems,
  supportedCapabilities,
} from "./connectorFacts";

interface ConnectorPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connector: ConnectorDirectoryItem | null;
  connection?: ChannelConnection | null;
  /** the viewer's role may change connections (marketplace_accounts:write) */
  canConnect?: boolean;
}

const ENTITY_ROWS = [
  { key: "products", name: "Products" },
  { key: "listings", name: "Listings" },
  { key: "inventory", name: "Inventory" },
  { key: "orders", name: "Orders" },
] as const;
const ENTITY_TEXT = { healthy: "Healthy", warning: "Done with errors", error: "Failed", syncing: "Syncing", idle: "No recent run" } as const;

const USEFUL: Record<string, (name: string) => string> = {
  product_import: (n) => `Centralize your ${n} catalog`,
  listings: (n) => `Publish and update listings on ${n} from one place`,
  inventory: () => "Keep inventory aligned with your master stock",
  orders: (n) => `Bring ${n} orders into the central order workflow`,
  returns: (n) => `Track ${n} returns`,
  shipping: (n) => `Create shipments and labels for ${n} orders`,
  promotions: (n) => `Push price updates to ${n}`,
};

export function ConnectorPreviewDrawer({ isOpen, onClose, connector, connection: initialConnection, canConnect = true }: ConnectorPreviewDrawerProps) {
  const navigate = useNavigate();
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    setIsAcknowledged(false);
  }, [connector?.id, isOpen]);

  // the live connection (per-entity sync state, recent jobs) when the business has an account of this connector
  const { data: liveConnection } = useConnection(initialConnection?.id || null);
  const connection = liveConnection || initialConnection;

  // size of the master catalogue, shown as "potential setup" only once it is loaded
  const { data: stats } = useCatalogStats({});

  if (!isOpen || !connector) return null;

  const hasAccount = Boolean(connection);
  const isConnected = connector.status === "connected" || connector.status === "needs_attention" || hasAccount;
  const isUnavailable = connector.status === "unavailable" && !hasAccount;
  const supported = supportedCapabilities(connector);
  const requirements = requirementItems(connector);
  const token = connection?.account ? tokenText(connection.account) : null;

  const detailsPath = `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connector.id}`;
  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const connectionLine = connection
    ? `${connection.status === "healthy" ? "✓ Healthy" : connection.status === "paused" ? "Paused" : "! Needs attention"} · Last sync ${connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "never"}`
    : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200" onClick={onClose} />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[490px] flex-col border-l border-[#E5E5E5] bg-[#FFFFFF] shadow-2xl transition-transform animate-in slide-in-from-right duration-200"
        aria-label={`${connector.name} connector details`}
      >
        <div className="flex items-start justify-between border-b border-[#F0F0F0] px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-[20px] font-bold tracking-tight text-[#111111]">{connector.name}</h2>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#16A34A]">
                    <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
                    Connected
                  </span>
                  {connectionLine && <span className="text-[12px] text-[#666666]">{connectionLine}</span>}
                </>
              ) : isUnavailable ? (
                <span className="text-[12px] font-medium text-[#737373]">Unavailable</span>
              ) : (
                <span className="text-[12px] font-medium text-[#737373]">Available to connect</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-[#171717]">
          {/* ===== CONNECTED ===== */}
          {isConnected && (
            <>
              {connection ? (
                <div className="grid grid-cols-2 gap-y-3 rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px]">
                  <div>
                    <span className="text-[#737373]">Account</span>
                    <p className="mt-0.5 font-medium text-[#111111]">{connection.accountIdentifier || connection.name}</p>
                  </div>
                  <div>
                    <span className="text-[#737373]">Connected</span>
                    <p className="mt-0.5 font-medium text-[#111111]">
                      {connection.connectedAt ? new Date(connection.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not connected"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#737373]">Health</span>
                    <p className={`mt-0.5 font-medium ${connection.status === "healthy" ? "text-[#16A34A]" : "text-[#D97706]"}`}>
                      {connection.status.charAt(0).toUpperCase() + connection.status.slice(1)}
                      {` · ${connection.health.pulseScore}%`}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#737373]">Last successful sync</span>
                    <p className="mt-0.5 font-medium text-[#111111]">{connection.lastSyncAt && connection.lastSyncAt !== "Never" ? ago(connection.lastSyncAt) : "Never"}</p>
                  </div>
                  {token && (
                    <div className="col-span-2">
                      <span className="text-[#737373]">Access token</span>
                      <p className={`mt-0.5 font-medium ${token.tone === "bad" ? "text-red-600" : token.tone === "warn" ? "text-[#D97706]" : "text-[#111111]"}`}>{token.text}</p>
                    </div>
                  )}
                  {connection.health.frictionPoints.length > 0 && (
                    <ul className="col-span-2 list-disc list-inside text-[11px] text-[#D97706]">
                      {connection.health.frictionPoints.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px] text-[#525252]">
                  {connector.statusReason ?? "Your workspace has an account of this connector."}
                </p>
              )}

              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[#111111]">Enabled capabilities</h3>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  {supported.length === 0 && <span className="text-[#737373]">None enabled yet</span>}
                  {supported.map((cap) => (
                    <span key={cap} className="inline-flex items-center gap-1 rounded-md bg-[#F4F4F5] px-2.5 py-1 text-[#27272A] font-medium">
                      ✓ {cap}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">Additional capabilities depend on supported APIs and commercial/API permissions.</p>
                <button type="button" onClick={() => go(detailsPath)} className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1 pt-1">
                  View capabilities →
                </button>
              </div>

              {connection && (
                <div className="space-y-3 border-t border-[#F0F0F0] pt-5">
                  <h3 className="text-[13px] font-semibold text-[#111111]">Synchronization</h3>
                  <div className="space-y-2.5 text-[12px]">
                    {ENTITY_ROWS.map((row) => {
                      const e = connection.entitySyncStatus?.[row.key];
                      const st = e?.status ?? "idle";
                      return (
                        <div key={row.key} className="flex items-center justify-between py-1 border-b border-[#F5F5F5] last:border-none">
                          <span className="text-[#404040] font-medium">{row.name}</span>
                          <span className="text-[#737373] flex items-center gap-1.5">
                            {st === "healthy" && <span className="text-[#16A34A]">✓</span>}
                            {ENTITY_TEXT[st]}
                            {e?.at ? ` · ${ago(e.at)}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {connection && (
                <div className="space-y-3 border-t border-[#F0F0F0] pt-5">
                  <h3 className="text-[13px] font-semibold text-[#111111]">Recent activity</h3>
                  {(connection.activityHistory ?? []).length > 0 ? (
                    <div className="space-y-2 text-[12px]">
                      {(connection.activityHistory ?? []).map((act) => (
                        <div key={act.id} className="text-[#737373]">
                          <span className="font-medium text-[#111111]">{act.timeText}</span> - {act.title}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-1 text-[12px] text-[#737373]">No sync activity recorded yet for this channel.</div>
                  )}
                  <button type="button" onClick={() => go(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connection.id}`)} className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1 pt-1">
                    View sync history →
                  </button>
                </div>
              )}

              <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">Connector subscription</h3>
                <p className="font-medium text-[#111111]">{FEE_TEXT}</p>
                <p className="text-[11px] text-[#737373]">{FEE_NOTE}</p>
              </div>

              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 pb-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => go(connection ? `${ROUTES.MARKETPLACE_HUB}?q=${encodeURIComponent(connection.name)}` : ROUTES.MARKETPLACE_HUB)}
                    className="flex-1 h-9 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors"
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    disabled={!connection}
                    onClick={() => connection && go(`${ROUTES.LISTINGS}?account=${connection.id}`)}
                    className="flex-1 h-9 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    View listings
                  </button>
                </div>
                <div className="flex flex-col gap-2 pt-2 text-[12px]">
                  <button type="button" onClick={() => go(ROUTES.MARKETPLACE_HUB)} className="text-left font-medium text-[#525252] hover:text-[#111111]">
                    ← Back to Marketplace Hub
                  </button>
                  <button type="button" onClick={() => go(connection ? `${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${connection.id}` : detailsPath)} className="text-left font-medium text-[#525252] hover:text-[#111111]">
                    Connection settings →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ===== UNAVAILABLE ===== */}
          {isUnavailable && (
            <>
              <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px] space-y-3">
                <p className="text-[#525252] leading-relaxed">{connector.statusReason || "This connector cannot be connected to your workspace right now."}</p>
                <button
                  type="button"
                  onClick={() => go(detailsPath)}
                  className="h-8 px-3.5 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
                >
                  View requirements
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-[#111111]">Supported capabilities</h3>
                <p className="text-[12px] text-[#525252]">{supported.length > 0 ? supported.join(" · ") : "None enabled yet"}</p>
                <button type="button" onClick={() => go(detailsPath)} className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1">
                  View capabilities →
                </button>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">Availability and capabilities depend on supported APIs and commercial/API permissions.</p>
              </div>

              <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">Requirements</h3>
                {requirements.length > 0 ? (
                  <ul className="list-disc list-inside text-[#525252]">
                    {requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#525252]">{accessText(connector)}</p>
                )}
                <p className="text-[#737373] text-[11px]">No account connection can start until this connector is available.</p>
              </div>

              <div className="space-y-2 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">Connector subscription</h3>
                <p className="font-semibold text-[#111111]">{FEE_TEXT}</p>
                <p className="text-[#737373] text-[11px]">{FEE_NOTE}</p>
              </div>

              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 pb-2">
                <button type="button" disabled className="w-full h-10 rounded-lg bg-[#F5F5F5] text-[12px] font-semibold text-[#A3A3A3] cursor-not-allowed">
                  Connect
                </button>
                <button type="button" onClick={onClose} className="text-left font-medium text-[12px] text-[#525252] hover:text-[#111111] pt-1">
                  ← Back to available connectors
                </button>
              </div>
            </>
          )}

          {/* ===== AVAILABLE ===== */}
          {!isConnected && !isUnavailable && (
            <>
              <p className="text-[12px] text-[#525252] leading-relaxed">{connector.description}</p>

              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold text-[#111111]">Capabilities</h3>
                <div className="space-y-2 text-[12px]">
                  {CAPABILITY_ROWS.map((row) => {
                    const support = capabilitySupport(connector, row.key);
                    return (
                      <div key={row.key} className="flex items-center justify-between py-1 border-b border-[#F7F7F7] last:border-none">
                        <span className="text-[#404040]">{row.label}</span>
                        <span className={support === "Supported" ? "font-medium text-[#16A34A] flex items-center gap-1" : "font-normal text-[#737373]"}>
                          {support === "Supported" && "✓ "}
                          {support}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed pt-1">
                  Support depends on actual implementation, supported APIs and commercial/API permissions. "Depends" means the marketplace gives API access only to approved partners.
                </p>
                <button type="button" onClick={() => go(detailsPath)} className="text-[12px] font-medium text-[#111111] hover:underline flex items-center gap-1">
                  View capabilities →
                </button>
              </div>

              {connector.capabilities.length > 0 && (
                <div className="space-y-2.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                  <h3 className="text-[13px] font-semibold text-[#111111]">Why it may be useful</h3>
                  <ul className="space-y-2 text-[#525252]">
                    {connector.capabilities
                      .filter((c) => USEFUL[c])
                      .map((c) => (
                        <li key={c} className="flex items-start gap-2">
                          <span className="text-[#111111]">•</span>
                          <span>{USEFUL[c](connector.name)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {stats && (
                <div className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4 text-[12px] space-y-1">
                  <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wider">Potential setup</span>
                  <p className="text-[13px] font-semibold text-[#111111]">
                    {formatNumber(stats.products)} master products · {formatNumber(stats.variants)} variants
                  </p>
                  <p className="text-[11px] text-[#737373]">Products can be prepared for this channel after connection.</p>
                </div>
              )}

              <div className="space-y-3 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">Connector subscription</h3>
                <p className="text-[11px] text-[#737373]">{FEE_NOTE}</p>
                <div className="grid grid-cols-2 gap-y-2 py-2 border-y border-[#F0F0F0] text-[12px]">
                  <span className="text-[#737373]">Connector fee</span>
                  <span className="text-right font-medium text-[#111111]">{FEE_TEXT}</span>
                  <span className="text-[#737373]">Connection</span>
                  <span className="text-right text-[#111111]">{accessText(connector)}</span>
                  <span className="text-[#737373]">Regions</span>
                  <span className="text-right text-[#111111]">{regionsText(connector)}</span>
                  <span className="text-[#737373]">Environment</span>
                  <span className="text-right text-[#111111]">{environmentText(connector)}</span>
                  <span className="text-[#737373]">Request limit</span>
                  <span className="text-right text-[#111111]">{limitText(connector)}</span>
                  <span className="text-[#737373]">Order events</span>
                  <span className="text-right text-[#111111]">{connector.webhooks ? "Pushed by webhook" : "Polled"}</span>
                </div>
                {connector.readiness?.notes && <p className="text-[11px] text-[#737373]">{connector.readiness.notes}</p>}
              </div>

              {requirements.length > 0 && (
                <div className="space-y-1.5 border-t border-[#F0F0F0] pt-5 text-[12px]">
                  <h3 className="text-[13px] font-semibold text-[#111111]">What you will need</h3>
                  <ul className="list-disc list-inside text-[#525252]">
                    {requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2 border-t border-[#F0F0F0] pt-5 text-[12px]">
                <h3 className="text-[13px] font-semibold text-[#111111]">Connection steps</h3>
                <p className="text-[11px] text-[#525252] leading-relaxed">{connectionSteps(connector).join(" → ")}</p>
              </div>

              <div className="border-t border-[#F0F0F0] pt-4">
                <label
                  htmlFor="marketplace-connect-acknowledgment"
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] cursor-pointer hover:bg-[#F5F5F5] transition-colors select-none"
                >
                  <input
                    type="checkbox"
                    id="marketplace-connect-acknowledgment"
                    checked={isAcknowledged}
                    onChange={(e) => setIsAcknowledged(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#D4D4D4] text-[#111111] focus:ring-0 cursor-pointer"
                  />
                  <div className="text-[12px] leading-relaxed">
                    <span className="font-semibold text-[#111111] block">Connecting does not publish products automatically</span>
                    <span className="text-[11px] text-[#666666] block mt-0.5">
                      I understand that connecting this channel allows syncing catalog and order data. I can review catalog, listing, and synchronization rules before activating live workflows.
                    </span>
                  </div>
                </label>
              </div>

              <div className="border-t border-[#F0F0F0] pt-4 pb-2 space-y-2">
                <span title={canConnect ? undefined : WRITE_REASON} className="block">
                  <button
                    type="button"
                    disabled={!isAcknowledged || !canConnect}
                    onClick={() => go(`${ROUTES.MARKETPLACE_HUB}/connect/${connector.id}`)}
                    className={`w-full h-10 rounded-lg text-[13px] font-semibold transition-colors shadow-none ${
                      isAcknowledged && canConnect ? "bg-[#000000] text-[#FFFFFF] hover:bg-neutral-800 cursor-pointer" : "bg-[#E5E5E5] text-[#A3A3A3] cursor-not-allowed"
                    }`}
                  >
                    Continue
                  </button>
                </span>
                <p className="text-center text-[11px] text-[#737373]">
                  {canConnect ? "Next: Connector Details · Review before connecting" : WRITE_REASON}
                </p>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

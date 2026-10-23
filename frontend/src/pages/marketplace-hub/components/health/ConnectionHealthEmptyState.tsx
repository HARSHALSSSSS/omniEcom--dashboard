import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

interface ConnectionHealthEmptyStateProps {
  onAddChannel?: () => void;
}

export function ConnectionHealthEmptyState({ onAddChannel }: ConnectionHealthEmptyStateProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full space-y-12 pb-24 text-[#111111] animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
            NETWORK HEALTH
          </span>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-[#111111]">
            Connection health
          </h1>
          <p className="mt-1 text-[13px] text-[#666666]">
            See how reliably your marketplaces and commerce services are communicating with your workspace.
          </p>
        </div>
        <div className="text-[12px] text-[#8A8A8A]">
          No connections yet
        </div>
      </div>

      {/* Hero Center Card with Connector Arrow */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-8 md:p-12 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-12">
          {/* Left Business Node */}
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 bg-[#000000] rounded-sm" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#111111]">
              YOUR BUSINESS
            </span>
            <span className="text-[#A3A3A3] text-[13px] hidden md:inline">——————————→</span>
          </div>

          {/* Right Main Prompt */}
          <div className="flex-1 space-y-3">
            <h2 className="text-[22px] font-bold tracking-tight text-[#111111]">
              Connect a marketplace to begin
            </h2>
            <p className="text-[13px] text-[#525252] max-w-xl leading-relaxed">
              Bring your products, inventory and orders into one workspace. Your network health will appear as soon as your first channel is connected.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <button
                type="button"
                onClick={onAddChannel || (() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS))}
                className="h-9 px-4 rounded-lg bg-[#000000] text-[12px] font-semibold text-[#FFFFFF] hover:bg-neutral-800 transition-colors shadow-none"
              >
                Add channel
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS)}
                className="h-9 px-4 rounded-lg border border-[#D4D4D4] bg-[#FFFFFF] text-[12px] font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-colors"
              >
                Browse connectors
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Three Pillars Section */}
      <div className="space-y-6 pt-4 border-t border-[#F0F0F0]">
        <h3 className="text-[16px] font-bold text-[#111111]">
          Your workspace stays central.
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[12px]">
          {/* Column 1 */}
          <div className="space-y-2 border-t border-[#E5E5E5] pt-4">
            <h4 className="font-semibold text-[#111111]">Products</h4>
            <p className="text-[#666666] leading-relaxed">
              Keep your master catalog connected to each sales channel without duplicate entry.
            </p>
          </div>

          {/* Column 2 */}
          <div className="space-y-2 border-t border-[#E5E5E5] pt-4">
            <h4 className="font-semibold text-[#111111]">Inventory</h4>
            <p className="text-[#666666] leading-relaxed">
              Know when stock changes reach your marketplaces in real time with continuous verification.
            </p>
          </div>

          {/* Column 3 */}
          <div className="space-y-2 border-t border-[#E5E5E5] pt-4">
            <h4 className="font-semibold text-[#111111]">Orders</h4>
            <p className="text-[#666666] leading-relaxed">
              Bring channel orders back into a single operational view for unified picking and fulfillment.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-[#8A8A8A] pt-4">
          Connecting does not publish products automatically. You control catalog mapping and marketplace activation.
        </p>
      </div>
    </div>
  );
}

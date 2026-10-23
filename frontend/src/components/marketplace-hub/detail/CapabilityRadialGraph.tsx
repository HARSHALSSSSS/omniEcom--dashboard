import type { CapStatus } from "@/pages/marketplace-hub/components/connectorFacts";

export type CapabilityKey = "catalog" | "listings" | "inventory" | "orders" | "shipping" | "returns" | "reviews" | "promotions";

interface CapabilityRadialGraphProps {
  connectorName: string;
  /** what the connector really supports: supported, depends (needs marketplace approval) or unavailable */
  statuses: Record<CapabilityKey, CapStatus>;
}

export function CapabilityRadialGraph({
  connectorName,
  statuses,
}: CapabilityRadialGraphProps) {
 
  const nodes = [
    {
      key: "catalog",
      label: "Catalog",
      status: statuses.catalog,
      left: 170,
      top: 8,
      connectorPoint: { x: 226, y: 42 },
      centerPoint: { x: 300, y: 90 },
    },
    {
      key: "listings",
      label: "Listings",
      status: statuses.listings,
      left: 364,
      top: 8,
      connectorPoint: { x: 420, y: 42 },
      centerPoint: { x: 356, y: 90 },
    },
    {
      key: "inventory",
      label: "Inventory",
      status: statuses.inventory,
      left: 510,
      top: 65,
      connectorPoint: { x: 510, y: 82 },
      centerPoint: { x: 376, y: 105 },
    },
    {
      key: "orders",
      label: "Orders",
      status: statuses.orders,
      left: 510,
      top: 150,
      connectorPoint: { x: 510, y: 167 },
      centerPoint: { x: 376, y: 125 },
    },
    {
      key: "shipping",
      label: "Shipping",
      status: statuses.shipping,
      left: 364,
      top: 196,
      connectorPoint: { x: 420, y: 196 },
      centerPoint: { x: 356, y: 142 },
    },
    {
      key: "returns",
      label: "Returns",
      status: statuses.returns,
      left: 170,
      top: 196,
      connectorPoint: { x: 226, y: 196 },
      centerPoint: { x: 300, y: 142 },
    },
    {
      key: "reviews",
      label: "Reviews",
      status: statuses.reviews,
      left: 18,
      top: 150,
      connectorPoint: { x: 130, y: 167 },
      centerPoint: { x: 280, y: 125 },
    },
    {
      key: "promotions",
      label: "Promotions",
      status: statuses.promotions,
      left: 18,
      top: 65,
      connectorPoint: { x: 130, y: 82 },
      centerPoint: { x: 280, y: 105 },
    },
  ];

  return (
    <div className="w-full flex flex-col items-start select-none">
      <div className="relative w-full max-w-[656px] h-[238px] overflow-hidden">

        <svg
          className="absolute inset-0 w-[656px] h-[238px] pointer-events-none"
          viewBox="0 0 656 238"
        >
          
          <rect
            x="264"
            y="52"
            width="128"
            height="128"
            fill="none"
            stroke="#EAEAEA"
            strokeWidth="1"
          />

          {nodes.map((n) => {
            const isSupported = n.status === "supported";
            return (
              <line
                key={n.key}
                x1={n.connectorPoint.x}
                y1={n.connectorPoint.y}
                x2={n.centerPoint.x}
                y2={n.centerPoint.y}
                stroke="#BDBDBD"
                strokeWidth="1"
                strokeDasharray={isSupported ? "none" : "3 3"}
              />
            );
          })}
        </svg>

        <div
          className="absolute flex flex-col items-center justify-center bg-[#000000] text-white z-10"
          style={{
            left: "280px",
            top: "90px",
            width: "96px",
            height: "52px",
          }}
        >
          <span className="text-[13px] font-semibold leading-[19px] text-[#FFFFFF] capitalize truncate max-w-[88px] text-center">
            {connectorName}
          </span>
          <span className="text-[10px] font-normal leading-[15px] text-[#A3A3A3] uppercase tracking-wider text-center">
            CONNECTOR
          </span>
        </div>

        {nodes.map((n) => {
          const isSupported = n.status === "supported";
          return (
            <div
              key={n.key}
              className="absolute flex flex-col items-center justify-center bg-[#FFFFFF] z-10"
              style={{
                left: `${n.left}px`,
                top: `${n.top}px`,
                width: "112px",
                height: "34px",
              }}
            >
              <div className="flex items-center gap-1.5 leading-[17px]">
                {isSupported ? (
                  <span className="text-[11px] font-semibold text-[#000000]">✓</span>
                ) : n.status === "depends" ? (
                  <span className="inline-block w-2 h-2 rounded-full border border-[#000000] bg-linear-to-r from-[#000000] from-50% to-transparent to-50%" />
                ) : (
                  <span className="text-[11px] font-semibold text-[#A3A3A3]">—</span>
                )}
                <span className={`text-[12px] font-semibold ${n.status === "unavailable" ? "text-[#A3A3A3]" : "text-[#000000]"}`}>
                  {n.label}
                </span>
              </div>
              <span className="text-[10px] font-normal leading-[15px] text-[#666666]">
                {isSupported ? "Supported" : n.status === "depends" ? "Depends" : "Not available"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

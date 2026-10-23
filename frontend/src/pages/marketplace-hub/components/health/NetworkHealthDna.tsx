interface NetworkHealthDnaProps {
  authStatus?: "healthy" | "warning" | "error";
  syncStatus?: "healthy" | "warning" | "error";
  catalogStatus?: "healthy" | "warning" | "error";
  inventoryStatus?: "healthy" | "warning" | "error";
  ordersStatus?: "healthy" | "warning" | "error";
}

export function NetworkHealthDna({
  authStatus = "healthy",
  syncStatus = "healthy",
  catalogStatus = "healthy",
  inventoryStatus = "healthy",
  ordersStatus = "healthy",
}: NetworkHealthDnaProps) {
  const dimensions = [
    { label: "Authentication", status: authStatus },
    { label: "Synchronization", status: syncStatus },
    { label: "Catalog", status: catalogStatus },
    { label: "Inventory", status: inventoryStatus },
    { label: "Orders", status: ordersStatus },
  ];

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-[#111111]">
          Network health DNA
        </h3>
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A8A8A]">
          DIAGNOSTIC HEALTH · ACROSS ALL CONNECTIONS
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 pt-2">
        {dimensions.map((dim) => {
          const isError = dim.status === "error";
          const isAttention = dim.status === "warning";
          const statusText = isError
            ? "Critical"
            : isAttention
            ? "Attention"
            : "Healthy";

          const textColor = isError
            ? "text-[#DC2626]"
            : isAttention
            ? "text-[#D97706]"
            : "text-[#16A34A]";

          const barColor = isError
            ? "bg-[#DC2626]"
            : isAttention
            ? "bg-[#D97706]"
            : "bg-[#16A34A]";

          return (
            <div key={dim.label} className="space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#525252] font-medium">{dim.label}</span>
                <span className={`font-semibold ${textColor}`}>{statusText}</span>
              </div>
              <div className="h-1.5 w-full bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className={`h-full w-full ${barColor} rounded-full`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

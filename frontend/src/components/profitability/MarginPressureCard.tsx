import React from "react";
import { FIGMA_MARGIN_PRESSURE, FIGMA_MARGIN_PRESSURE_PRODUCTS } from "./figmaProfitData";

export const MarginPressureCard: React.FC = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Margin pressure</h2>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {FIGMA_MARGIN_PRESSURE.healthyCount}
          </span>
          <span className="text-xs text-emerald-600 font-bold">▲</span>
          <span className="text-xs text-muted-foreground">Healthy products</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {FIGMA_MARGIN_PRESSURE.belowTargetCount}
          </span>
          <span className="text-xs text-amber-600 font-bold">▲</span>
          <span className="text-xs text-muted-foreground">Below target products</span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {FIGMA_MARGIN_PRESSURE.lowContributionCount}
          </span>
          <span className="text-xs text-orange-600 font-bold">▲</span>
          <span className="text-xs text-muted-foreground">Low contribution products</span>
        </div>
      </div>

      {/* Mini Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/80 text-[11px] font-medium text-muted-foreground">
              <th className="py-2 px-3 font-medium">Product</th>
              <th className="py-2 px-3 font-medium text-right">Revenue</th>
              <th className="py-2 px-3 font-medium text-right">Contribution</th>
              <th className="py-2 px-3 font-medium text-right">Margin</th>
              <th className="py-2 px-3 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {FIGMA_MARGIN_PRESSURE_PRODUCTS.map((prod) => (
              <tr key={prod.name} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-3 font-medium text-foreground">{prod.name}</td>
                <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">{prod.revenue}</td>
                <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">{prod.contribution}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-foreground tabular-nums">{prod.margin}</td>
                <td className="py-2.5 px-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      prod.status === "Healthy"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                        : "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                    }`}
                  >
                    <span>{prod.status === "Healthy" ? "✓" : "⚠️"}</span>
                    <span>{prod.status}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

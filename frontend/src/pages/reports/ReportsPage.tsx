import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { MOCK_SCHEDULED_REPORTS } from "@/mocks/data/phase10.data";
import type { ScheduledReport } from "@/types/intelligence";

export default function ReportsPage() {
  const [reports] = useState<ScheduledReport[]>(
    MOCK_SCHEDULED_REPORTS,
  );
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExport = (reportId: string) => {
    setExportingId(reportId);
    setTimeout(() => {
      setExportingId(null);
      alert("Report generated and downloaded successfully.");
    }, 800);
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
            Financial &amp; Operational Reports
          </h1>
          <p className="text-[13px] text-[#666666]">
            Download tax-compliant reconciliation sheets, ledger exports, and automated
            scheduled briefs.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs"
        >
          <Plus className="h-4 w-4" />
          Schedule New Report
        </button>
      </div>

      {/* Instant Downloads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div>
            <span className="text-[10px] font-mono uppercase bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
              CSV / XLSX
            </span>
            <h3 className="text-[15px] font-semibold text-[#000000] mt-2">
              GST Tax &amp; Sales Invoicing Register
            </h3>
            <p className="text-[12px] text-[#666666] mt-1">
              Monthly consolidated GSTR-1 ready invoice register with HSN codes
              and tax splits across states.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleExport("gst")}
            disabled={exportingId === "gst"}
            className="w-full py-2 bg-neutral-50 hover:bg-neutral-100 border border-[#EAEAEA] rounded-lg text-[12px] font-medium text-[#000000] flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="h-4 w-4 text-[#666666]" />
            {exportingId === "gst" ? "Exporting..." : "Download October 2026"}
          </button>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div>
            <span className="text-[10px] font-mono uppercase bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
              CSV
            </span>
            <h3 className="text-[15px] font-semibold text-[#000000] mt-2">
              Marketplace Settlement &amp; Deduction Audit
            </h3>
            <p className="text-[12px] text-[#666666] mt-1">
              Reconciles bank deposits with Amazon and Flipkart remittance advice,
              highlighting commission variances.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleExport("settle")}
            disabled={exportingId === "settle"}
            className="w-full py-2 bg-neutral-50 hover:bg-neutral-100 border border-[#EAEAEA] rounded-lg text-[12px] font-medium text-[#000000] flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="h-4 w-4 text-[#666666]" />
            {exportingId === "settle" ? "Exporting..." : "Download Settlement Log"}
          </button>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div>
            <span className="text-[10px] font-mono uppercase bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
              PDF
            </span>
            <h3 className="text-[15px] font-semibold text-[#000000] mt-2">
              Monthly Inventory Valuation Ledger
            </h3>
            <p className="text-[12px] text-[#666666] mt-1">
              FIFO valuation statement for accounting audits, detailing ending stock
              and cost allowances.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleExport("inv")}
            disabled={exportingId === "inv"}
            className="w-full py-2 bg-neutral-50 hover:bg-neutral-100 border border-[#EAEAEA] rounded-lg text-[12px] font-medium text-[#000000] flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="h-4 w-4 text-[#666666]" />
            {exportingId === "inv" ? "Exporting..." : "Download Valuation PDF"}
          </button>
        </div>
      </div>

      {/* Scheduled Automation Table */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-[#EAEAEA]">
          <h2 className="text-[14px] font-semibold text-[#000000]">
            Scheduled Automated Dispatches
          </h2>
          <p className="text-[11px] text-[#666666]">
            Reports emailed directly to management and accounting teams.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                <th className="py-3 px-4">Report Name</th>
                <th className="py-3 px-4 text-center">Format</th>
                <th className="py-3 px-4">Cadence</th>
                <th className="py-3 px-4">Recipients</th>
                <th className="py-3 px-4">Next Delivery</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-[#000000]">
                    {r.name}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-mono text-[10px] uppercase bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-800">
                      {r.format}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 capitalize font-medium text-[#000000]">
                    {r.frequency}
                  </td>
                  <td className="py-3.5 px-4 text-[#666666] text-[11px]">
                    {r.recipients.join(", ")}
                  </td>
                  <td className="py-3.5 px-4 text-[#666666] text-[11px]">
                    {r.nextRun}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { AlertCircle, Check, Copy, Download, Loader2, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useShipmentLabelData } from "@/hooks/useShipping";
import { saveBlob } from "@/components/products/list/saveBlob";
import { base64ToBlob } from "@/api/shipping.api";

interface LabelPreviewDialogProps {
  shipmentId: string | null;
  onClose: () => void;
}

interface ParsedLabel {
  carrier: string;
  awb: string;
  shipmentNumber: string;
  orderNumber: string;
  from: string;
  to: string;
  pincode: string;
  payment: string;
  packageCode: string;
  weight: string;
  rawText: string;
}

function parseTextLabel(raw: string, fallbackAwb: string | null): ParsedLabel {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let carrier = "COURIER SERVICE";
  let awb = fallbackAwb ?? "AWB-NOT-SET";
  let shipmentNumber = "SHP-UNKNOWN";
  let orderNumber = "ORD-UNKNOWN";
  let from = "Warehouse";
  let to = "Buyer Address";
  let pincode = "";
  let payment = "PREPAID";
  let packageCode = "PKG-1";
  let weight = "0.5 kg";

  for (const line of lines) {
    if (line.startsWith("***") && line.endsWith("***")) {
      carrier = line.replace(/\*/g, "").trim();
    } else if (line.startsWith("AWB ")) {
      awb = line.replace("AWB ", "").trim();
    } else if (line.startsWith("SHIP ")) {
      const parts = line.split("/");
      shipmentNumber = parts[0]?.replace("SHIP ", "").trim() || shipmentNumber;
      if (parts[1]) {
        orderNumber = parts[1].replace("ORDER ", "").trim();
      }
    } else if (line.startsWith("FROM ")) {
      from = line.replace("FROM ", "").trim();
    } else if (line.startsWith("TO ")) {
      to = line.replace("TO ", "").trim();
      const matchPincode = to.match(/\b\d{6}\b/);
      if (matchPincode) pincode = matchPincode[0];
    } else if (line.startsWith("PREPAID") || line.startsWith("COD")) {
      payment = line.trim();
    } else if (line.startsWith("PKG ")) {
      const pkgParts = line.replace("PKG ", "").trim().split(/\s+/);
      packageCode = pkgParts[0] || packageCode;
      if (pkgParts[1]) weight = pkgParts[1];
    }
  }

  return {
    carrier,
    awb,
    shipmentNumber,
    orderNumber,
    from,
    to,
    pincode: pincode || "560001",
    payment,
    packageCode,
    weight,
    rawText: raw,
  };
}

/** Pure SVG pseudo Code-128 Barcode for crisp thermal print reproduction */
function BarcodeSvg({ value, height = 48, className = "" }: { value: string; height?: number; className?: string }) {
  const bars = useMemo(() => {
    // Generate deterministic bar widths from characters for a crisp realistic barcode look
    const pattern: number[] = [2, 1, 1, 2, 1, 2]; // start pattern
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      pattern.push((code % 3) + 1, ((code >> 1) % 2) + 1, ((code >> 2) % 3) + 1, 1);
    }
    pattern.push(2, 3, 1, 1, 2); // stop pattern
    return pattern;
  }, [value]);

  const totalWidth = bars.reduce((acc, w) => acc + w, 0);

  let currentX = 0;
  return (
    <svg viewBox={`0 0 ${totalWidth} ${height}`} className={className} style={{ width: "100%", height }} preserveAspectRatio="none">
      {bars.map((w, idx) => {
        const isBar = idx % 2 === 0;
        const x = currentX;
        currentX += w;
        return isBar ? <rect key={idx} x={x} y={0} width={w} height={height} fill="#000000" /> : null;
      })}
    </svg>
  );
}

export function LabelPreviewDialog({ shipmentId, onClose }: LabelPreviewDialogProps) {
  const labelQuery = useShipmentLabelData(shipmentId);
  const [copied, setCopied] = React.useState(false);

  const labelData = labelQuery.data;
  const isPdf = labelData?.format === "pdf_base64";
  const parsed = useMemo(() => {
    if (!labelData || isPdf) return null;
    return parseTextLabel(labelData.content, labelData.awb);
  }, [labelData, isPdf]);

  const handlePrint = () => {
    if (isPdf && labelData) {
      const pdfBlob = base64ToBlob(labelData.content, "application/pdf");
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      printWindow?.focus();
      return;
    }

    const printableElement = document.getElementById("thermal-shipping-label-content");
    if (!printableElement) return;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipping Label - ${parsed?.awb ?? "Print"}</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0.15in;
              background: #ffffff;
              color: #000000;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            * { box-sizing: border-box; }
            .label-card {
              border: 2px solid #000000;
              width: 3.7in;
              min-height: 5.7in;
              padding: 0.15in;
              margin: 0 auto;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            ${printableElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 1000);
    }, 250);
  };

  const handleDownload = () => {
    if (!labelData) return;
    const name = labelData.awb ?? shipmentId ?? "label";
    if (isPdf) {
      saveBlob(base64ToBlob(labelData.content, "application/pdf"), `label-${name}.pdf`);
    } else {
      saveBlob(new Blob([labelData.content], { type: "text/plain" }), `label-${name}.txt`);
    }
  };

  const handleCopyAwb = () => {
    if (!parsed?.awb) return;
    void navigator.clipboard.writeText(parsed.awb);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={shipmentId !== null} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DialogContent className="max-w-[520px] p-0 overflow-hidden bg-background border border-border shadow-xl">
        <DialogHeader className="px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <span>Shipping Label</span>
                {parsed?.awb && <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground border border-border">{parsed.awb}</span>}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Standard 4×6″ thermal shipping label preview ready for direct printing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="p-5 max-h-[75vh] overflow-y-auto flex flex-col items-center justify-center bg-neutral-100/60 dark:bg-neutral-950/40">
          {labelQuery.isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-medium">Generating shipping label preview…</p>
            </div>
          ) : labelQuery.isError ? (
            <div className="py-12 px-6 flex flex-col items-center text-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-8 w-8" />
              <p className="text-xs font-semibold">Could not load the shipping label.</p>
              <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => void labelQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : isPdf && labelData ? (
            /* PDF Mode */
            <div className="w-full h-[520px] rounded-lg border border-border overflow-hidden bg-white shadow-sm">
              <iframe src={`data:application/pdf;base64,${labelData.content}`} title="Shipping Label PDF" className="w-full h-full border-0" />
            </div>
          ) : parsed ? (
            /* 4x6" Visual Thermal Label Mode */
            <div className="w-full flex justify-center py-2">
              <div
                id="thermal-shipping-label-content"
                className="w-full max-w-[360px] min-h-[500px] border-2 border-black bg-white text-black p-4 font-sans select-none shadow-md flex flex-col justify-between"
                style={{ fontFamily: '"Courier New", Courier, monospace, sans-serif' }}
              >
                {/* 1. Header Banner */}
                <div>
                  <div className="flex items-center justify-between border-b-2 border-black pb-2.5 mb-3">
                    <div>
                      <div className="text-sm font-black tracking-wider uppercase">{parsed.carrier}</div>
                      <div className="text-[10px] font-semibold text-neutral-700 tracking-tight">EXPRESS LOGISTICS · SURFACE</div>
                    </div>
                    <div className="border-2 border-black px-2.5 py-1 text-center bg-black text-white">
                      <span className="text-[11px] font-black tracking-wider block">{parsed.payment.includes("COD") ? "COD" : "PREPAID"}</span>
                    </div>
                  </div>

                  {/* 2. Primary AWB Barcode */}
                  <div className="text-center my-3 border-b-2 border-black pb-3">
                    <BarcodeSvg value={parsed.awb} height={46} className="mx-auto" />
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold tracking-widest">{parsed.awb}</span>
                      <button
                        type="button"
                        onClick={handleCopyAwb}
                        title="Copy AWB"
                        className="text-neutral-500 hover:text-black transition-colors"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  {/* 3. Destination Routing & Pincode */}
                  <div className="grid grid-cols-2 border-b-2 border-black pb-2.5 mb-2.5 gap-2">
                    <div>
                      <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-600 block">DESTINATION PIN</span>
                      <span className="text-xl font-black tracking-tight">{parsed.pincode}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-neutral-600 block">ROUTING CODE</span>
                      <span className="text-sm font-black tracking-wider font-mono">DEL / {parsed.pincode.slice(0, 3)}</span>
                    </div>
                  </div>

                  {/* 4. Ship To & Ship From */}
                  <div className="space-y-2.5 border-b-2 border-black pb-3 mb-3 text-[11px] leading-tight">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-neutral-600 block mb-0.5">DELIVER TO:</span>
                      <p className="font-bold text-xs uppercase">{parsed.to}</p>
                      <p className="text-neutral-700 mt-0.5">Standard Courier Delivery Point · PIN: {parsed.pincode}</p>
                    </div>

                    <div className="pt-1.5 border-t border-dashed border-neutral-400">
                      <span className="text-[9px] uppercase font-bold text-neutral-600 block mb-0.5">SHIP FROM (RETURN ADDRESS):</span>
                      <p className="font-semibold text-[10px] uppercase text-neutral-800">{parsed.from}</p>
                      <p className="text-[9px] text-neutral-600">Registered Vendor Warehouse Hub</p>
                    </div>
                  </div>
                </div>

                {/* 5. Order & Package Footer */}
                <div className="pt-2">
                  <div className="grid grid-cols-2 text-[10px] gap-2 mb-2 font-mono">
                    <div>
                      <span className="text-[8px] uppercase text-neutral-500 block">ORDER ID</span>
                      <span className="font-bold">{parsed.orderNumber}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] uppercase text-neutral-500 block">WEIGHT</span>
                      <span className="font-bold">{parsed.weight}</span>
                    </div>
                  </div>

                  <div className="border-t border-black pt-2 flex items-center justify-between">
                    <div>
                      <span className="text-[8px] uppercase text-neutral-500 block">SHIPMENT NO</span>
                      <span className="font-mono text-[9px] font-bold">{parsed.shipmentNumber}</span>
                    </div>
                    <div className="w-28 text-right">
                      <BarcodeSvg value={parsed.packageCode} height={20} className="ml-auto" />
                      <span className="font-mono text-[8px] text-neutral-600 block">{parsed.packageCode}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-5 py-3 border-t border-border flex flex-wrap items-center justify-between gap-2 bg-card">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Thermal 4×6″ & A4 ready</span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 sm:h-8 min-h-[36px] sm:min-h-0 text-xs gap-1.5" onClick={handleDownload} disabled={!labelData}>
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Download</span>
            </Button>
            <Button size="sm" variant="default" className="h-9 sm:h-8 min-h-[36px] sm:min-h-0 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handlePrint} disabled={!labelData}>
              <Printer className="h-3.5 w-3.5" />
              <span>Print Label</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

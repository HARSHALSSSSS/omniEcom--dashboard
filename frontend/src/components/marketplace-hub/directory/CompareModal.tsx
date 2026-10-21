import { Check, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DirectoryItem } from "@/types/directory";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  authModeLabel,
  capabilityLabel,
} from "./directoryUtils";

interface Props {
  items: DirectoryItem[];
  open: boolean;
  onClose: () => void;
}

/** side by side facts and the real capability lists of up to three connectors */
export function CompareModal({ items, open, onClose }: Props) {
  const capabilities = [
    ...new Set(items.flatMap((i) => i.capabilities)),
  ].sort();
  const facts: Array<{ label: string; value: (i: DirectoryItem) => string }> = [
    { label: "Category", value: (i) => CATEGORY_LABEL[i.category] },
    { label: "Connection", value: (i) => authModeLabel(i.authFlow.mode) },
    {
      label: "Regions",
      value: (i) =>
        i.supportedRegions.length
          ? i.supportedRegions.join(", ")
          : "Not listed",
    },
    { label: "Status", value: (i) => STATUS_LABEL[i.status] },
    {
      label: "Partner approval",
      value: (i) => (i.partnerGated ? "Required" : "Not required"),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare connectors ({items.length})</DialogTitle>
          <DialogDescription>
            What each connector can do today, as reported by the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="w-[28%] py-2 pr-3 font-medium text-muted-foreground"
                >
                  <span className="sr-only">Feature</span>
                </th>
                {items.map((i) => (
                  <th
                    key={i.id}
                    scope="col"
                    className="py-2 pr-3 text-sm font-semibold text-foreground"
                  >
                    {i.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => (
                <tr key={f.label} className="border-b border-border/60">
                  <th
                    scope="row"
                    className="py-2 pr-3 font-medium text-muted-foreground"
                  >
                    {f.label}
                  </th>
                  {items.map((i) => (
                    <td key={i.id} className="py-2 pr-3 text-foreground">
                      {f.value(i)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th
                  scope="colgroup"
                  colSpan={items.length + 1}
                  className="pb-1 pt-4 text-xs font-semibold text-foreground"
                >
                  Capabilities
                </th>
              </tr>
              {capabilities.length === 0 && (
                <tr>
                  <td
                    colSpan={items.length + 1}
                    className="py-2 text-muted-foreground"
                  >
                    No capabilities are enabled for these connectors yet.
                  </td>
                </tr>
              )}
              {capabilities.map((cap) => (
                <tr key={cap} className="border-b border-border/40">
                  <th
                    scope="row"
                    className="py-1.5 pr-3 font-normal capitalize text-muted-foreground"
                  >
                    {capabilityLabel(cap)}
                  </th>
                  {items.map((i) => (
                    <td key={i.id} className="py-1.5 pr-3">
                      {i.capabilities.includes(cap) ? (
                        <Check
                          className="h-4 w-4 text-emerald-600"
                          aria-label="Supported"
                        />
                      ) : (
                        <Minus
                          className="h-4 w-4 text-muted-foreground"
                          aria-label="Not supported"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Star,
  CheckCircle2,
  ArrowRight,
  X,
  Store,
  Truck,
  Layers,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import { useConnectorDirectory } from "@/hooks/useConnectors";

export default function ConnectorMarketplacePage() {
  const navigate = useNavigate();
  const { data: connectors = [] } = useConnectorDirectory();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const filtered = connectors.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleCompare = (id: string) => {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter((item) => item !== id));
    } else {
      if (selectedForCompare.length >= 3) {
        alert("You can compare up to 3 connectors at once.");
        return;
      }
      setSelectedForCompare([...selectedForCompare, id]);
    }
  };

  const compareItems = connectors.filter((c) =>
    selectedForCompare.includes(c.id),
  );

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="CONNECTOR DIRECTORY"
        title="Connector Marketplace"
        description="Discover and connect with Indian marketplaces, global storefronts, and automated logistics networks."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.MARKETPLACE_HUB)}
          >
            Back to Hub
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search Amazon, Flipkart, Delhivery, Shopify..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {["all", "marketplace", "storefront", "shipping"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat === "all" ? "All Connectors" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Directory Connectors */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const isSelectedForCompare = selectedForCompare.includes(item.id);
          const isConnected = item.status === "connected";

          return (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40">
                    {item.category === "storefront" ? (
                      <Layers className="h-6 w-6 text-[#1D4ED8]" />
                    ) : item.category === "shipping" ? (
                      <Truck className="h-6 w-6 text-purple-600" />
                    ) : (
                      <Store className="h-6 w-6 text-amber-600" />
                    )}
                  </div>
                  {item.isPopular && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                      Popular
                    </span>
                  )}
                  {item.isPartnerGated && (
                    <span className="flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                      <Lock className="h-3 w-3" /> Gated Partner
                    </span>
                  )}
                </div>

                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {item.name}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                  {item.description}
                </p>

                {/* Rating & Pricing */}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <div className="flex items-center gap-1 text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    <span className="font-semibold text-foreground">
                      {item.rating}
                    </span>
                    <span className="text-muted-foreground">
                      ({item.reviewsCount})
                    </span>
                  </div>
                  <span className="font-medium text-foreground">
                    {item.pricing.monthlyFeeINR === 0
                      ? "Free Included"
                      : `₹${item.pricing.monthlyFeeINR}/mo`}
                  </span>
                </div>

                {/* Capabilities pills */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {item.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {cap.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <button
                  onClick={() => toggleCompare(item.id)}
                  className={`text-xs font-medium transition-colors ${
                    isSelectedForCompare
                      ? "text-[#1D4ED8] underline"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isSelectedForCompare ? "✓ Compared" : "+ Compare"}
                </button>

                {isConnected ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Connected
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() =>
                      navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${item.id}`)
                    }
                  >
                    Connect <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Compare Toolbar */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 rounded-full border border-border bg-card px-6 py-3 shadow-xl">
          <span className="text-xs font-semibold text-foreground">
            {selectedForCompare.length} connector(s) selected
          </span>
          <Button
            size="sm"
            className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowCompareModal(true)}
          >
            Compare Features
          </Button>
          <button
            onClick={() => setSelectedForCompare([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Comparison Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-bold text-foreground">
                Compare Connectors ({compareItems.length})
              </h3>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-6">
              {compareItems.map((c) => (
                <div key={c.id} className="space-y-4 rounded-xl border border-border p-4">
                  <h4 className="font-semibold text-foreground">{c.name}</h4>
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <p>Category: <span className="text-foreground capitalize">{c.category}</span></p>
                    <p>Auth Type: <span className="font-mono text-foreground uppercase">{c.authType}</span></p>
                    <p>Pricing: <span className="text-foreground">{c.pricing.planName}</span></p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1">Capabilities:</p>
                    <ul className="text-[11px] list-disc list-inside text-muted-foreground space-y-0.5">
                      {c.capabilities.map((cap) => (
                        <li key={cap} className="capitalize">{cap.replace("_", " ")}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/onboarding/wizard";
import { ConnectorCard } from "@/components/marketplace-hub/directory/ConnectorCard";
import { CompareModal } from "@/components/marketplace-hub/directory/CompareModal";
import {
  MAX_COMPARE,
  categoryTabs,
  matchesSearch,
} from "@/components/marketplace-hub/directory/directoryUtils";
import { ROUTES } from "@/constants/routes";
import { useCan } from "@/hooks/useCan";
import { useDirectory } from "@/hooks/useDirectory";

export default function ConnectorMarketplacePage() {
  const navigate = useNavigate();
  const directory = useDirectory();
  const canConnect = useCan("marketplace_accounts:write");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const items = useMemo(() => directory.data?.items ?? [], [directory.data]);
  const tabs = useMemo(() => categoryTabs(items), [items]);
  const filtered = items.filter(
    (i) =>
      (selectedCategory === "all" || i.category === selectedCategory) &&
      matchesSearch(i, searchTerm),
  );
  const compareItems = items.filter((i) => selectedForCompare.includes(i.id));

  const toggleCompare = (id: string) =>
    setSelectedForCompare((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= MAX_COMPARE
          ? cur
          : [...cur, id],
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

      {!canConnect && directory.isSuccess && (
        <p
          role="note"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          You have view-only access to connectors. Ask an owner or admin to
          connect a marketplace.
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Search connectors"
            placeholder="Search by marketplace name or description"
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="pl-9 text-xs"
          />
        </div>

        <div
          role="tablist"
          aria-label="Connector categories"
          className="flex flex-wrap items-center gap-2"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedCategory === tab.key}
              onClick={() => setSelectedCategory(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${selectedCategory === tab.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {directory.isPending && (
        <div
          role="status"
          aria-label="Loading connectors"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </div>
      )}

      {directory.isError && (
        <div className="space-y-3">
          <InlineError error={directory.error} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void directory.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {directory.isSuccess && items.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No connectors are available for your business yet.
        </p>
      )}

      {directory.isSuccess && items.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <p>No connector matches your search.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ConnectorCard
              key={item.id}
              item={item}
              comparing={selectedForCompare.includes(item.id)}
              compareFull={selectedForCompare.length >= MAX_COMPARE}
              canConnect={canConnect}
              onToggleCompare={toggleCompare}
              onConnect={(code) =>
                navigate(`${ROUTES.MARKETPLACE_HUB}/connect/${code}`)
              }
              onManage={(code) =>
                navigate(`${ROUTES.MARKETPLACE_HUB_CONNECTORS}/${code}`)
              }
            />
          ))}
        </div>
      )}

      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full border border-border bg-card px-6 py-3 shadow-xl">
          <span className="text-xs font-semibold text-foreground">
            {selectedForCompare.length} of {MAX_COMPARE} selected
          </span>
          <Button
            size="sm"
            className="h-8 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            disabled={selectedForCompare.length < 2}
            title={
              selectedForCompare.length < 2
                ? "Pick at least two connectors"
                : undefined
            }
            onClick={() => setShowCompareModal(true)}
          >
            Compare Features
          </Button>
          <button
            type="button"
            onClick={() => setSelectedForCompare([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <CompareModal
        items={compareItems}
        open={showCompareModal}
        onClose={() => setShowCompareModal(false)}
      />
    </div>
  );
}

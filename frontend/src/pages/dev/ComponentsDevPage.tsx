import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/useToast";

import { StatusPill } from "@/components/common/StatusPill";
import { PulseStrip } from "@/components/common/PulseStrip";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Stepper } from "@/components/common/Stepper";
import { ReadinessMeter } from "@/components/common/ReadinessMeter";
import { InsightCard } from "@/components/common/InsightCard";
import { EmptyState, ErrorState } from "@/components/common/QueryBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { SecretField } from "@/components/common/SecretField";
import { FileDropzone } from "@/components/common/FileDropzone";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { FilterBar, FilterPill } from "@/components/common/FilterBar";
import { DataTable } from "@/components/common/DataTable";
import { ChartCard } from "@/components/common/ChartCard";

import {
  OrderStatus,
  ListingStatus,
  ConnectionStatus,
  InventoryHealth,
  SlaState,
  IssuePriority,
} from "@/constants/enums";
import type { ColumnDef } from "@tanstack/react-table";

interface MockTableRow {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: string;
  status: OrderStatus;
}

const MOCK_TABLE_DATA: MockTableRow[] = [
  {
    id: "1",
    name: "Classic Black T-Shirt",
    sku: "TS-BLK-042",
    stock: 42,
    price: "₹699",
    status: OrderStatus.Confirmed,
  },
  {
    id: "2",
    name: "Running Shoes — Blue",
    sku: "RS-BLU-211",
    stock: 184,
    price: "₹2,499",
    status: OrderStatus.Dispatched,
  },
  {
    id: "3",
    name: "Leather Wallet",
    sku: "LW-BRN-018",
    stock: 0,
    price: "₹899",
    status: OrderStatus.Cancelled,
  },
  {
    id: "4",
    name: "Travel Duffel Bag",
    sku: "TD-GRY-091",
    stock: 28,
    price: "₹1,899",
    status: OrderStatus.Picking,
  },
  {
    id: "5",
    name: "Wireless Earbuds",
    sku: "WE-BLK-105",
    stock: 75,
    price: "₹1,299",
    status: OrderStatus.New,
  },
];

export default function ComponentsDevPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [chartRange, setChartRange] = useState("30d");
  const [searchVal, setSearchVal] = useState("");

  const tableColumns: ColumnDef<MockTableRow>[] = [
    {
      accessorKey: "name",
      header: "Product / Item",
      cell: ({ row }) => (
        <div>
          <span className="font-semibold text-foreground">
            {row.original.name}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {row.original.sku}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "stock",
      header: "Available Stock",
      cell: ({ row }) => (
        <span className="font-mono tabular-nums">
          {row.original.stock} units
        </span>
      ),
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.price}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Order Status",
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-12 pb-16">
        <PageHeader
          eyebrow="Phase 1 Design System"
          title="Component Inventory & Showcase"
          description="Live demonstration of all base UI building blocks, common widgets, layout primitives, and data states matching the Figma reference screenshots."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast({
                    title: "Action triggered",
                    description: "This is a notification toast test.",
                    variant: "success",
                  })
                }
              >
                Trigger Toast
              </Button>
              <Button size="sm" onClick={() => setDrawerOpen(true)}>
                Open Context Drawer
              </Button>
            </>
          }
        />

        {/* Section 1: Base UI Buttons & Inputs */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            1. Base UI Elements
          </h2>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Button Variants & Sizes
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="default">Primary Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
              <Button loading>Loading</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large CTA</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Standard Text Input</label>
              <Input placeholder="Enter brand name..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Secret / Masked Field
              </label>
              <SecretField
                placeholder="API secret key..."
                helpText="Stored securely, masked in UI"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Select Dropdown</label>
              <Select defaultValue="d2c">
                <SelectTrigger>
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="d2c">D2C Brand</SelectItem>
                  <SelectItem value="marketplace">
                    Marketplace Seller
                  </SelectItem>
                  <SelectItem value="retail">Retail Business</SelectItem>
                  <SelectItem value="wholesaler">Wholesaler</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Textarea</label>
              <Textarea
                placeholder="Enter product description or dispatch notes..."
                rows={3}
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-medium">Checkboxes & Radios</label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox defaultChecked />
                  <span>Auto-sync inventory</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox />
                  <span>Notify on stockout</span>
                </label>
              </div>

              <RadioGroup
                defaultValue="simple"
                className="flex items-center gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="simple" id="r1" />
                  <label htmlFor="r1" className="text-xs cursor-pointer">
                    Simple Stock
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="warehouse" id="r2" />
                  <label htmlFor="r2" className="text-xs cursor-pointer">
                    Multi-Warehouse
                  </label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tabs & Skeleton Loading
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="variants">Variants</TabsTrigger>
                  <TabsTrigger value="channels">Channels</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="overview"
                  className="p-3 border rounded-md text-xs text-muted-foreground"
                >
                  Overview tab content panel
                </TabsContent>
                <TabsContent
                  value="variants"
                  className="p-3 border rounded-md text-xs text-muted-foreground"
                >
                  Variants tab content panel
                </TabsContent>
                <TabsContent
                  value="channels"
                  className="p-3 border rounded-md text-xs text-muted-foreground"
                >
                  Channels tab content panel
                </TabsContent>
              </Tabs>

              <div className="space-y-2 p-3 border rounded-md">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Badges & Tooltips
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="healthy">Healthy</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="critical">Critical</Badge>
              <Badge variant="info">Syncing</Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    Hover for Tooltip
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Stock coverage is calculated as Available ÷ Average daily
                    sales
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* Section 2: Status Pills */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            2. Status Pills (Always color + text paired)
          </h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill status={OrderStatus.New} />
            <StatusPill status={OrderStatus.Confirmed} />
            <StatusPill status={OrderStatus.Picking} />
            <StatusPill status={OrderStatus.Packing} />
            <StatusPill status={OrderStatus.Dispatched} />
            <StatusPill status={OrderStatus.Delivered} />
            <StatusPill status={OrderStatus.Cancelled} />
            <StatusPill status={ListingStatus.Live} />
            <StatusPill status={ListingStatus.Ready} />
            <StatusPill status={ListingStatus.NeedsReview} />
            <StatusPill status={ListingStatus.Blocked} />
            <StatusPill status={ConnectionStatus.Connected} />
            <StatusPill status={ConnectionStatus.NeedsAttention} />
            <StatusPill status={InventoryHealth.LowStock} />
            <StatusPill status={SlaState.Approaching} />
            <StatusPill status={SlaState.AtRisk} />
            <StatusPill status={IssuePriority.Critical} />
          </div>
        </section>

        {/* Section 3: KPI Pulse Strip */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            3. Business Snapshot & Pulse Strip
          </h2>
          <PulseStrip
            title="Business Snapshot"
            subtitle="Today"
            cards={[
              {
                label: "Orders",
                value: "126",
                delta: 12,
                deltaText: "vs previous period",
              },
              { label: "Revenue", value: "₹2.84L", delta: 8.4 },
              { label: "Units Sold", value: "318", delta: 6.2 },
              { label: "Return Rate", value: "4.8%", delta: -0.7 },
              {
                label: "Low-stock Products",
                value: "18",
                subtext: "Needs review",
                status: "warning",
              },
            ]}
          />
        </section>

        {/* Section 4: Chart Card */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            4. Chart Card (Dark Theme from Screen 08)
          </h2>
          <ChartCard
            dark
            title="Sales performance"
            subtitle="Track how your business is performing across connected channels."
            selectedRange={chartRange}
            onRangeChange={setChartRange}
            legend={
              <div className="flex items-center gap-4 text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-blue-500 inline-block" />{" "}
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 border-t border-dashed border-slate-500 inline-block" />{" "}
                  Previous period
                </span>
                <span className="text-slate-400">Daily revenue · INR</span>
              </div>
            }
            sidebar={
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Channel contribution · Today
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between py-1">
                      <span>Amazon</span>
                      <strong className="font-mono">₹1.24L</strong>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: "65%" }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between py-1">
                      <span>Flipkart</span>
                      <strong className="font-mono">₹68K</strong>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: "40%" }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between py-1">
                      <span>Shopify</span>
                      <strong className="font-mono">₹50K</strong>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full"
                        style={{ width: "30%" }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between py-1">
                      <span>Meesho</span>
                      <strong className="font-mono">₹42K</strong>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: "25%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div className="flex h-56 items-center justify-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-500">
              Interactive Recharts Multi-line Chart Surface (Mounted in Phase 9
              Dashboard)
            </div>
          </ChartCard>
        </section>

        {/* Section 5: Data Table & Filters */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            5. DataTable with Filters, Selection & Bulk Actions
          </h2>

          <FilterBar
            searchQuery={searchVal}
            onSearchChange={setSearchVal}
            hasActiveFilters={!!searchVal}
            onClearFilters={() => setSearchVal("")}
            filters={
              <>
                <FilterPill
                  label="All Channels"
                  options={[
                    { label: "Amazon", value: "amazon" },
                    { label: "Flipkart", value: "flipkart" },
                    { label: "Shopify", value: "shopify" },
                  ]}
                  onChange={() => {}}
                />
                <FilterPill
                  label="All Warehouses"
                  options={[
                    { label: "Mumbai Central", value: "mumbai" },
                    { label: "Delhi Hub", value: "delhi" },
                    { label: "Bangalore East", value: "bangalore" },
                  ]}
                  onChange={() => {}}
                />
              </>
            }
          />

          <DataTable
            columns={tableColumns}
            data={MOCK_TABLE_DATA}
            enableSelection
            bulkActions={(selected) => (
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-xs text-foreground"
                onClick={() =>
                  toast({
                    title: "Bulk action applied",
                    description: `Processed ${selected.length} items.`,
                    variant: "success",
                  })
                }
              >
                Export Selected
              </Button>
            )}
            onRowClick={(row) => {
              toast({
                title: "Row clicked",
                description: `Selected ${row.name} (${row.sku})`,
              });
            }}
          />
        </section>

        {/* Section 6: Stepper & Readiness Meter */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            6. Stepper & Product Readiness Meter
          </h2>

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Interactive Stepper
            </h3>
            <Stepper
              steps={[
                { id: "1", label: "Account" },
                { id: "2", label: "Business Profile" },
                { id: "3", label: "Sales Channels" },
                { id: "4", label: "Products" },
                { id: "5", label: "Inventory" },
                { id: "6", label: "Ready" },
              ]}
              currentStepIndex={currentStep}
              onStepClick={(idx) => setCurrentStep(idx)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <ReadinessMeter
              percent={38}
              requiredItems={[
                { id: "1", label: "Product name", completed: true },
                { id: "2", label: "Category", completed: true },
                { id: "3", label: "Product type", completed: true },
                {
                  id: "4",
                  label: "Primary image",
                  completed: false,
                  actionText: "Upload image",
                },
                {
                  id: "5",
                  label: "Master SKU",
                  completed: false,
                  actionText: "Verify",
                },
              ]}
              recommendedItems={[
                { id: "6", label: "Description", completed: false },
                {
                  id: "7",
                  label: "Brand",
                  completed: false,
                  actionText: "Confirm",
                },
                { id: "8", label: "Attributes", completed: false },
              ]}
              blockers={[
                {
                  id: "b1",
                  label: "Missing primary image",
                  severity: "blocking",
                  description:
                    "Add a primary image before publishing this product to marketplaces.",
                  actionLabel: "Fix issue",
                  onAction: () =>
                    toast({
                      title: "Prompted image upload",
                      variant: "warning",
                    }),
                },
              ]}
            />

            <div className="space-y-6">
              <InsightCard
                badgeText="RECOMMENDED ACTION"
                title="18 products are approaching their stock threshold."
                description="Based on recent sales velocity, replenishing 6 products this week could reduce potential stockouts across Amazon and Flipkart."
                primaryActionLabel="Review recommendation"
                onPrimaryAction={() =>
                  toast({
                    title: "Opening purchase order planner",
                    variant: "success",
                  })
                }
                secondaryActionLabel="Dismiss"
                onSecondaryAction={() => toast({ title: "Advisory dismissed" })}
              />

              <FileDropzone
                onFileSelect={(file) =>
                  toast({
                    title: "File selected",
                    description: `${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
                    variant: "success",
                  })
                }
              />
            </div>
          </div>
        </section>

        {/* Section 7: Activity Timeline & Data States */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-foreground border-b pb-2">
            7. Activity Timeline & Data States
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Movements (Screen 26)
              </h3>
              <ActivityTimeline
                events={[
                  {
                    id: "1",
                    timestamp: "12:42",
                    title: "Amazon order reduced master inventory",
                    description: "72 → 68 units",
                  },
                  {
                    id: "2",
                    timestamp: "12:31",
                    title: "8 units received into Mumbai warehouse",
                    description: "PO #1049 batch arrived",
                  },
                  {
                    id: "3",
                    timestamp: "11:58",
                    title: "Manual stock adjustment",
                    description: "Black T-Shirt +12 units",
                  },
                ]}
              />
            </div>

            <EmptyState
              title="No active listings on Meesho"
              description="Connect your Meesho seller credentials to start publishing and syncing catalog listings."
              actionLabel="Connect Meesho"
              onAction={() =>
                toast({ title: "Redirecting to connection setup" })
              }
            />

            <ErrorState
              title="Marketplace sync interrupted"
              message="Failed to retrieve live order feeds from Flipkart. Token will expire in 2 days."
              onRetry={() => toast({ title: "Retrying connection sync..." })}
            />
          </div>
        </section>

        {/* Modal & Drawer test triggers */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Disconnect Amazon Marketplace?"
          description="Are you sure you want to disconnect this channel? Live inventory updates will halt and channel orders will no longer sync into your pipeline."
          confirmText="Disconnect Channel"
          variant="destructive"
          onConfirm={() => {
            setConfirmOpen(false);
            toast({
              title: "Channel disconnected",
              description: "Amazon SP-API connector is paused.",
              variant: "destructive",
            });
          }}
        />

        <ContextDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Order #ORD-10291"
          badge={<StatusPill status={OrderStatus.Picking} size="sm" />}
          description="Flipkart Smart Fulfillment · Placed 2h ago"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                className="text-xs text-destructive border-red-200"
              >
                Cancel Order
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setDrawerOpen(false);
                  toast({
                    title: "Order moved to Packing",
                    variant: "success",
                  });
                }}
                className="text-xs"
              >
                Proceed to Packing
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">Rohan Sharma</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination:</span>
                <span className="font-medium">Pune, Maharashtra 411038</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Total:</span>
                <span className="font-bold">₹1,499 (Prepaid)</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                Items to pick (2)
              </h4>
              <div className="rounded-md border border-border p-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    Classic Black T-Shirt
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Size: L · Qty: 1
                  </p>
                </div>
                <StatusPill status={InventoryHealth.Healthy} size="sm" />
              </div>
              <div className="rounded-md border border-border p-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    Travel Duffel Bag
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Color: Gray · Qty: 1
                  </p>
                </div>
                <StatusPill status={InventoryHealth.LowStock} size="sm" />
              </div>
            </div>
          </div>
        </ContextDrawer>
      </div>
    </TooltipProvider>
  );
}

import {
  LayoutDashboard,
  AlertCircle,
  Package,
  Boxes,
  ShoppingCart,
  Truck,
  Ship,
  RefreshCcw,
  List,
  Store,
  Tag,
  Megaphone,
  ClipboardList,
  BarChart3,
  Lightbulb,
  Bot,
  Workflow,
  Bell,
  Settings,
} from "lucide-react";
import { ROUTES } from "./routes";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "needs-attention"; // special badge driven by store
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: ROUTES.DASHBOARD, icon: LayoutDashboard },
      {
        label: "Needs Attention",
        href: ROUTES.NEEDS_ATTENTION,
        icon: AlertCircle,
        badge: "needs-attention",
      },
      { label: "Products", href: ROUTES.PRODUCTS, icon: Package },
      { label: "Inventory", href: ROUTES.INVENTORY, icon: Boxes },
      { label: "Orders", href: ROUTES.ORDERS, icon: ShoppingCart },
      { label: "Fulfillment", href: ROUTES.FULFILLMENT, icon: Truck },
      { label: "Shipping", href: ROUTES.SHIPPING, icon: Ship },
      { label: "Returns", href: ROUTES.RETURNS, icon: RefreshCcw },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Listings", href: ROUTES.LISTINGS, icon: List },
      { label: "Marketplace Hub", href: ROUTES.MARKETPLACE_HUB, icon: Store },
      { label: "Pricing", href: ROUTES.PRICING, icon: Tag },
      { label: "Promotions", href: ROUTES.PROMOTIONS, icon: Megaphone },
      { label: "Procurement", href: ROUTES.PROCUREMENT, icon: ClipboardList },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Reports", href: ROUTES.REPORTS, icon: BarChart3 },
      {
        label: "Product Intelligence",
        href: ROUTES.PRODUCT_INTELLIGENCE,
        icon: Lightbulb,
      },
      { label: "AI Assistant", href: ROUTES.AI_ASSISTANT, icon: Bot },
      { label: "Automation", href: ROUTES.AUTOMATION, icon: Workflow },
    ],
  },
];

export const NAV_BOTTOM: NavItem[] = [
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Settings", href: ROUTES.SETTINGS, icon: Settings },
];

export type AuthType = "oauth" | "api_credentials" | "partner_gated";

export interface ConnectorField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "textarea";
  secret?: boolean;
  required: boolean;
  help?: string;
  helpUrl?: string;
  pattern?: RegExp;
  options?: { value: string; label: string }[];
}

export type ConnectorCapability =
  | "product_import"
  | "listings"
  | "inventory"
  | "orders"
  | "shipping"
  | "returns"
  | "promotions";

export interface ConnectorConfig {
  id:
    | "amazon"
    | "flipkart"
    | "meesho"
    | "shopify"
    | "snapdeal"
    | "delhivery"
    | "bluedart"
    | string;
  name: string;
  category: "marketplace" | "storefront" | "shipping" | "social" | "operations";
  authType: AuthType;
  fields: ConnectorField[];
  capabilities: ConnectorCapability[];
  scopesRequested?: string[];
  supportsTestConnection: boolean;
  reauthorizeEveryDays?: number;
  pricing?: { monthly: number; yearly: number };
}

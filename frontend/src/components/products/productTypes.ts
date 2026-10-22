/** The four product types of the product screens (create, edit, detail, list) and how the design names them. */
export type AnyProductType = "physical" | "digital" | "service" | "bundle";

export const PRODUCT_TYPE_OPTIONS: Array<{ value: AnyProductType; label: string }> = [
  { value: "physical", label: "Physical product" },
  { value: "digital", label: "Digital product" },
  { value: "service", label: "Service / Warranty" },
  { value: "bundle", label: "Bundle / Kit" },
];

export const PRODUCT_TYPE_LABEL: Record<AnyProductType, string> = {
  physical: "Physical product",
  digital: "Digital product",
  service: "Service / Warranty",
  bundle: "Bundle / Kit",
};

export const productTypeLabel = (t: string): string => PRODUCT_TYPE_LABEL[t as AnyProductType] ?? t;

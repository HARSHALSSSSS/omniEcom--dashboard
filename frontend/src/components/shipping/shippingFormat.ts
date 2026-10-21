import { formatDateTime } from "@/utils/format";

export const NO_WRITE_REASON = "Your role can view shipping but not change it.";
export const NO_CONFIGURE_REASON = "Only an admin can set up carriers.";

/** "—" for anything the API does not know */
export const orDash = (value: string | number | null | undefined): string => (value === null || value === undefined || value === "" ? "—" : String(value));

export const dateOrDash = (iso: string | null | undefined): string => (iso ? formatDateTime(iso) : "—");

export const paymentText = (method: string): string => (method === "cod" ? "COD" : method === "prepaid" ? "Prepaid" : "—");

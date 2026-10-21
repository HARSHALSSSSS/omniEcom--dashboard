import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Skeleton } from "@/components/ui/skeleton";

export const LINK_BTN =
  "text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:no-underline";

export const Divider = () => <div className="w-full h-[1px] bg-[#EAEAEA]" />;

export function SectionHead({ title, sub, action, level = 2 }: { title: string; sub?: ReactNode; action?: ReactNode; level?: 2 | 3 }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className="w-full flex flex-row justify-between items-center gap-4">
      <div className="flex flex-col items-start gap-1">
        <Tag className="text-[18px] font-semibold leading-[26px] text-[#000000]">{title}</Tag>
        {sub ? <p className="text-[12px] font-normal leading-[17px] text-[#666666]">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="w-full box-border flex flex-row items-center p-4 bg-[#F5F5F5] rounded-[8px] gap-3">
      <AlertCircle className="h-[18px] w-[18px] text-[#666666] shrink-0" aria-hidden="true" />
      <div className="flex-1 flex flex-col items-start gap-1">
        <span className="text-[12px] font-semibold text-[#000000]">{title}</span>
        {text ? <span className="text-[12px] font-normal text-[#666666]">{text}</span> : null}
      </div>
      {action}
    </div>
  );
}

export function TableShell({ head, children, label }: { head: ReactNode; children: ReactNode; label: string }) {
  return (
    <div role="table" aria-label={label} className="w-full border border-[#EAEAEA] rounded-[8px] overflow-x-auto">
      <div className="min-w-[560px]">
        <div role="row" className="w-full flex flex-row items-center px-3 h-[38px] bg-[#F5F5F5] text-[11px] font-medium leading-[16px] text-[#666666]">
          {head}
        </div>
        <div className="divide-y divide-[#EAEAEA] bg-[#FFFFFF]">{children}</div>
      </div>
    </div>
  );
}

export const Row = ({ children, height = "h-[50px]" }: { children: ReactNode; height?: string }) => (
  <div role="row" className={`w-full flex flex-row items-center px-3 ${height} text-[12px] leading-[17px]`}>
    {children}
  </div>
);

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[12px] font-normal leading-[17px] text-[#666666]">{label}</span>
      <span className="text-[12px] font-normal leading-[17px] text-[#000000] break-words max-w-full">{value}</span>
    </div>
  );
}

export function AsideRows({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
      {rows.map(([k, v]) => (
        <div key={k} className="w-full flex justify-between items-start gap-3 py-2.5">
          <dt className="text-[#666666]">{k}</dt>
          <dd className="text-[#000000] font-normal text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Metric({ label, value, first, last }: { label: string; value: ReactNode; first?: boolean; last?: boolean }) {
  return (
    <div className={`flex-1 flex flex-col items-start gap-1 ${first ? "pr-5" : last ? "pl-5 border-l border-[#EAEAEA]" : "px-5 border-l border-[#EAEAEA]"}`}>
      <span className="text-[12px] font-normal leading-[17px] text-[#666666]">{label}</span>
      <span className="text-[18px] font-semibold leading-[26px] text-[#000000]">{value}</span>
    </div>
  );
}

/** main column + the 272px operational panel, the same split on every tab */
export function TabLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="w-full flex flex-col lg:flex-row items-start gap-8">
      <div className="flex-1 min-w-0 w-full flex flex-col items-start gap-7">{children}</div>
      <aside className="w-full lg:w-[272px] shrink-0 flex flex-col items-start pl-0 lg:pl-6 border-t lg:border-t-0 lg:border-l border-[#EAEAEA] gap-7 pt-6 lg:pt-0">
        {aside}
      </aside>
    </div>
  );
}

export function TabSkeleton({ label }: { label: string }) {
  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <div role="status" aria-label={`Loading ${label}`} className="w-full flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </TabLayout>
  );
}

export function TabError({ error, onRetry, label }: { error: unknown; onRetry: () => void; label: string }) {
  return (
    <div role="alert" className="w-full flex flex-col items-start gap-3 py-6">
      <span className="text-[14px] font-semibold text-[#000000]">The {label} could not be loaded</span>
      <span className="text-[12px] text-[#666666]">{errorMessage(error)}</span>
      <button type="button" onClick={onRetry} className="px-4 h-[36px] border border-[#666666] rounded-[8px] text-[12px] font-semibold hover:bg-[#F5F5F5]">
        Try again
      </button>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="w-full flex flex-col items-start py-4 gap-3">
      <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">{title}</span>
      {text ? <p className="text-[12px] font-normal leading-[17px] text-[#666666]">{text}</p> : null}
      {action}
    </div>
  );
}

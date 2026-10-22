import { useState } from "react";
import { useAssignInspection, useReturnMembers } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";
import { DRAWER_BTN_LIGHT, SELECT_SM } from "./design";
import { writeErrorMessage } from "./returnFormat";

const SKIP_TEXT: Record<string, string> = {
  not_received: "has not been received yet",
  inspection_finished: "is already inspected",
  not_found: "was not found",
};

interface AssignInspectorProps {
  ids: string[];
  /** the returns' numbers, for the confirmation */
  label: string;
  onDone?: () => void;
  className?: string;
}

/** names the inspector (an active member; the signed-in person when the role cannot list members) and starts the inspection of the returns */
export function AssignInspector({ ids, label, onDone, className }: AssignInspectorProps) {
  const permissions = useWorkspaceStore((s) => s.permissions);
  const me = useWorkspaceStore((s) => s.user);
  const members = useReturnMembers(permissions.includes("users:read"));
  const assign = useAssignInspection();
  const [userId, setUserId] = useState(me?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const options = members.data && members.data.length > 0 ? members.data : me ? [{ id: me.id, name: me.fullName }] : [];
  const chosen = userId || options[0]?.id || "";

  const onAssign = () => {
    if (!chosen || ids.length === 0) return;
    setError(null);
    assign.mutate(
      { ids, userId: chosen },
      {
        onSuccess: (res) => {
          if (res.skipped.length > 0 && res.assigned.length === 0) {
            const reason = res.skipped[0]?.reason ?? "";
            setError(`${label} ${SKIP_TEXT[reason] ?? `could not be assigned (${reason})`}.`);
            return;
          }
          toast({
            title: "Inspection assigned",
            description: res.skipped.length > 0 ? `${res.assigned.length} assigned, ${res.skipped.length} skipped (not received yet or already inspected).` : label,
            variant: "success",
          });
          onDone?.();
        },
        onError: (e) => setError(writeErrorMessage(e)),
      },
    );
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <select aria-label="Inspector" value={chosen} onChange={(e) => setUserId(e.target.value)} className={cn(SELECT_SM, "h-8 min-w-[160px]")}>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me?.id ? `${m.name} (me)` : m.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onAssign} disabled={!chosen || ids.length === 0 || assign.isPending} className={DRAWER_BTN_LIGHT}>
          {assign.isPending ? "Assigning..." : "Assign inspection"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ImportOptions, ImportSession } from "@/types/import";
import { CommitPanel } from "../CommitPanel";
import { ImportResult } from "../ImportResult";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ImportSession;
  options: ImportOptions | undefined;
  eligible: number | undefined;
  needsRevalidate: boolean;
  onRevalidated: () => void;
}

/** Starts the commit from the issues screen; keeps showing the job's progress and then its result. */
export function CommitDialog({ open, onOpenChange, session, options, eligible, needsRevalidate, onRevalidated }: Props) {
  const done = session.status === "committed" || session.status === "partially_committed";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{done ? "Import finished" : "Import the rows"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{session.fileName}</DialogDescription>
        </DialogHeader>
        {done && <ImportResult session={session} />}
        {!done && <CommitPanel session={session} options={options} eligible={eligible} canWrite needsRevalidate={needsRevalidate} onRevalidated={onRevalidated} />}
      </DialogContent>
    </Dialog>
  );
}

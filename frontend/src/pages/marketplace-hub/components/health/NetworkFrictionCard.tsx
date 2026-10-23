export interface FrictionIssue {
  connectionId: string;
  connectionName: string;
  issueTitle: string;
  affectedCount: number;
  severity: "warning" | "error";
}

interface NetworkFrictionCardProps {
  issues: FrictionIssue[];
  onInspectIssue: (connectionId: string) => void;
}

export function NetworkFrictionCard({ issues, onInspectIssue }: NetworkFrictionCardProps) {
  const hasIssues = issues.length > 0;

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-[15px] font-bold text-[#111111]">
          Network friction
        </h3>
        <p className="text-[12px] text-[#737373] mt-0.5">
          Problems currently affecting connected operations.
        </p>
      </div>

      {!hasIssues ? (
        <div className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] p-6 text-center space-y-1">
          <p className="text-[13px] font-semibold text-[#111111]">
            No active friction
          </p>
          <p className="text-[12px] text-[#737373]">
            No operations are waiting on a connection. All pipelines are clear.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue, idx) => {
            const isError = issue.severity === "error";
            const borderColor = isError ? "border-[#DC2626]" : "border-[#D97706]";
            const dotColor = isError ? "bg-[#DC2626]" : "bg-[#D97706]";

            return (
              <div
                key={issue.connectionId + idx}
                onClick={() => onInspectIssue(issue.connectionId)}
                className={`relative pl-4 border-l-2 ${borderColor} py-1 cursor-pointer hover:bg-[#FAFAFA] rounded-r-lg transition-colors p-2 space-y-1`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                  <span className="text-[13px] font-bold text-[#111111]">
                    {issue.affectedCount > 0 ? `${issue.affectedCount} products affected` : "Synchronization delayed"}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#737373]">
                  0{idx + 1} / {issue.connectionName}
                </div>
                <p className="text-[12px] text-[#525252]">
                  {issue.issueTitle}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

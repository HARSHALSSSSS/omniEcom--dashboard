import { useState, useEffect, useRef, useCallback } from "react";
import { importApi, JobStatusResponse } from "@/api/import.api";

interface UseJobPollingOptions {
  jobId: string | null;
  enabled?: boolean;
  intervalMs?: number;
  onComplete?: (result: JobStatusResponse) => void;
  onError?: (error: Error) => void;
}

export function useJobPolling({
  jobId,
  enabled = true,
  intervalMs = 800,
  onComplete,
  onError,
}: UseJobPollingOptions) {
  const [data, setData] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const poll = useCallback(async () => {
    if (!jobId || !enabled) return;

    try {
      const response = await importApi.getJobStatus(jobId);
      setData(response);

      if (
        response.status === "completed" ||
        response.status === "needs_attention" ||
        response.status === "failed"
      ) {
        setIsPolling(false);
        onCompleteRef.current?.(response);
      }
    } catch (err) {
      const errObj =
        err instanceof Error ? err : new Error("Failed to poll job status");
      setError(errObj);
      setIsPolling(false);
      onErrorRef.current?.(errObj);
    }
  }, [jobId, enabled]);

  useEffect(() => {
    if (!jobId || !enabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    // Initial fetch
    poll();

    const interval = setInterval(poll, intervalMs);

    return () => clearInterval(interval);
  }, [jobId, enabled, intervalMs, poll]);

  return {
    jobStatus: data,
    isPolling,
    error,
    refetch: poll,
  };
}

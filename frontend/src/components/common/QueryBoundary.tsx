import React from "react";
import { AlertCircle, FolderOpen, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No items found",
  description = "There is no data to display right now.",
  icon,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center bg-card/50",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        {icon ?? <FolderOpen className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Failed to load data",
  message = "An unexpected error occurred while fetching information. Please try again.",
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50/40 p-8 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      <p className="mt-1 text-xs text-red-700 max-w-sm">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 border-red-200 bg-white text-red-900 hover:bg-red-50 gap-2"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
};

interface QueryBoundaryProps<T> {
  isLoading: boolean;
  error: unknown;
  data: T | undefined | null;
  isEmpty?: (data: T) => boolean;
  onRetry?: () => void;
  loadingFallback?: React.ReactNode;
  emptyFallback?: React.ReactNode;
  children: (data: T) => React.ReactNode;
  className?: string;
}

export function QueryBoundary<T>({
  isLoading,
  error,
  data,
  isEmpty,
  onRetry,
  loadingFallback,
  emptyFallback,
  children,
  className,
}: QueryBoundaryProps<T>) {
  if (isLoading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <div className={cn("space-y-4 p-4", className)}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    const errorMsg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : undefined;
    return (
      <ErrorState message={errorMsg} onRetry={onRetry} className={className} />
    );
  }

  if (
    !data ||
    (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0)
  ) {
    return <>{emptyFallback ?? <EmptyState className={className} />}</>;
  }

  return <>{children(data)}</>;
}

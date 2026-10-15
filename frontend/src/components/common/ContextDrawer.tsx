import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/utils/cn";

interface ContextDrawerProps {
  drawerKey?: string;
  open?: boolean;
  onClose?: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const ContextDrawer: React.FC<ContextDrawerProps> = ({
  drawerKey,
  open: controlledOpen,
  onClose: controlledOnClose,
  title,
  description,
  badge,
  children,
  footer,
  className,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const isOpen =
    drawerKey !== undefined
      ? searchParams.get("drawer") === drawerKey
      : (controlledOpen ?? false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (drawerKey !== undefined) {
        searchParams.delete("drawer");
        setSearchParams(searchParams, { replace: true });
      }
      controlledOnClose?.();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-[390px] max-w-full flex flex-col p-0 border-l border-border bg-background shadow-2xl",
          className,
        )}
      >
        <SheetHeader className="p-5 pb-4 border-b border-border/80">
          <div className="flex items-center justify-between pr-6 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <SheetTitle className="text-base font-bold text-foreground">
                {title}
              </SheetTitle>
              {badge}
            </div>
          </div>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        {footer && (
          <SheetFooter className="p-4 border-t border-border bg-muted/30">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

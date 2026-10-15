import { useToastStore } from "@/hooks/useToast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./Toast";

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  return (
    <ToastProvider>
      {toasts.map((item) => (
        <Toast
          key={item.id}
          variant={item.variant}
          onOpenChange={(open) => {
            if (!open) removeToast(item.id);
          }}
        >
          <div className="grid gap-1">
            {item.title && <ToastTitle>{item.title}</ToastTitle>}
            {item.description && (
              <ToastDescription>{item.description}</ToastDescription>
            )}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

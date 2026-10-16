import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { useUiStore } from "@/store/ui.store";
import { MOCK_NOTIFICATIONS } from "@/mocks/data/settings.data";

export const NotificationsPanel = () => {
  const { notificationsPanelOpen, setNotificationsPanelOpen } = useUiStore();

  if (!notificationsPanelOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-['Inter',sans-serif]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-2xs transition-opacity"
        onClick={() => setNotificationsPanelOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-[390px] bg-white border-l border-[#EAEAEA] shadow-2xl flex flex-col">
          {/* Header */}
          <div className="h-16 px-5 border-b border-[#EAEAEA] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#000000]" />
              <h2 className="text-[14px] font-semibold text-[#000000]">
                Notifications
              </h2>
              <span className="text-[11px] font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                2 new
              </span>
            </div>

            <button
              type="button"
              onClick={() => setNotificationsPanelOpen(false)}
              className="text-neutral-400 hover:text-black transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#EAEAEA]">
            {MOCK_NOTIFICATIONS.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex flex-col gap-1.5 transition-colors hover:bg-neutral-50 ${
                  !n.read ? "bg-blue-50/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#000000] leading-snug">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-[#888888] shrink-0">
                    {n.timestamp}
                  </span>
                </div>
                <p className="text-[12px] text-[#555555] leading-relaxed">
                  {n.message}
                </p>

                {n.actionUrl && (
                  <Link
                    to={n.actionUrl}
                    onClick={() => setNotificationsPanelOpen(false)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline pt-1 self-start"
                  >
                    Take action →
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[#EAEAEA] bg-neutral-50 text-center">
            <Link
              to="/settings"
              onClick={() => setNotificationsPanelOpen(false)}
              className="text-[11px] font-medium text-[#666666] hover:text-black"
            >
              Manage alert preferences in Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

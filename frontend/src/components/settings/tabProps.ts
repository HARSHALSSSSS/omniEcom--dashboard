import type { SettingsController } from "@/hooks/useSettings";
import type { SettingsForm } from "./form";
import type { SettingsOverview } from "@/types/settings";

/** what every form tab receives: the server read model, the values being edited and the controller */
export interface TabProps {
  s: SettingsOverview;
  v: SettingsForm;
  ctl: SettingsController;
}

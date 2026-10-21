import { Link } from "react-router-dom";
import { StateBox } from "@/components/pricing/PricingStates";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";

/** the person's role has no `ai:use` permission */
export function NoAccess() {
  return <StateBox title="You do not have access to the AI Assistant." description="Ask an admin to give your role the AI permission." />;
}

/** the platform flag `ai.enabled` is off for this business (403 feature_disabled) */
export function NotEnabled() {
  return (
    <StateBox
      title="AI features are not enabled for this business."
      description="The AI Assistant is switched off for your workspace by the platform. Contact support or your account manager to have it turned on."
    />
  );
}

/** the business switched AI off in its own settings (403 ai_disabled) */
export function SwitchedOff({ onEnable, enabling }: { onEnable: () => void; enabling: boolean }) {
  return (
    <StateBox title="AI is switched off in your settings." description="Turn the advisory AI back on to ask questions and see insights. Nothing is ever changed without a person approving it.">
      <Button size="sm" loading={enabling} onClick={onEnable}>
        Turn AI on
      </Button>
      <Link to={ROUTES.SETTINGS} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Open settings
      </Link>
    </StateBox>
  );
}

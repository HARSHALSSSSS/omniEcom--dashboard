import React from "react";
import { Link } from "react-router-dom";
import { Stepper, type StepItem } from "@/components/common/Stepper";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";

interface WizardLayoutProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  onSaveAndExit?: () => void;
  sidebarTitle?: string;
  sidebarDescription?: string;
  sidebarContent?: React.ReactNode;
  children: React.ReactNode;
}

export const WizardLayout: React.FC<WizardLayoutProps> = ({
  steps,
  currentStepIndex,
  onStepClick,
  onSaveAndExit,
  sidebarTitle,
  sidebarDescription,
  sidebarContent,
  children,
}) => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Wizard top header with Stepper and Save & Exit */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6 sm:px-12">
        <Link
          to={ROUTES.DASHBOARD}
          className="text-base font-bold text-foreground"
        >
          [Product Name]
        </Link>

        <div className="max-w-xl flex-1 px-8 hidden md:block">
          <Stepper
            steps={steps}
            currentStepIndex={currentStepIndex}
            onStepClick={onStepClick}
          />
        </div>

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveAndExit}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Save & exit
          </Button>
        </div>
      </header>

      {/* Main wizard body */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left dark summary panel if provided */}
        {(sidebarTitle || sidebarContent) && (
          <aside className="w-full lg:w-[380px] shrink-0 bg-black p-8 lg:p-12 text-white flex flex-col justify-between">
            <div className="space-y-6">
              {sidebarTitle && (
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                    Step {currentStepIndex + 1} of {steps.length}
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight text-white leading-tight">
                    {sidebarTitle}
                  </h2>
                  {sidebarDescription && (
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      {sidebarDescription}
                    </p>
                  )}
                </div>
              )}
              {sidebarContent}
            </div>

            <p className="mt-8 text-[11px] text-neutral-500">
              Setup takes about 3 minutes.
            </p>
          </aside>
        )}

        {/* Right step form area */}
        <main className="flex flex-1 items-start justify-center p-6 sm:p-12 lg:p-16 overflow-y-auto">
          <div className="w-full max-w-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
};

import React from "react";
import { Navigate } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { FullPageLoader } from "@/components/common/FullPageLoader";

interface PublicOnlyRouteProps {
  children: React.ReactNode;
}

export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { bootstrapStatus, isAuthenticated, onboardingComplete, onboardingResumeStep } = useWorkspaceStore();

  if (bootstrapStatus !== "ready") return <FullPageLoader />;

  if (isAuthenticated) {
    if (!onboardingComplete) {
      return <Navigate to={`${ROUTES.ONBOARDING}/${onboardingResumeStep}`} replace />;
    }
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
};

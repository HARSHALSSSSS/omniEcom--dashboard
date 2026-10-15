import React from "react";
import { Navigate } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";

interface PublicOnlyRouteProps {
  children: React.ReactNode;
}

export const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const { isAuthenticated, onboardingComplete } = useWorkspaceStore();

  if (isAuthenticated) {
    if (!onboardingComplete) {
      return <Navigate to={`${ROUTES.ONBOARDING}/business`} replace />;
    }
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
};

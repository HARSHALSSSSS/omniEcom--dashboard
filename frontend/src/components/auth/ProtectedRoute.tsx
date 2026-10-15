import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireOnboarding = true,
}) => {
  const { isAuthenticated, onboardingComplete } = useWorkspaceStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />;
  }

  // If user hasn't finished onboarding and is trying to access protected workspace routes
  if (requireOnboarding && !onboardingComplete) {
    return <Navigate to={`${ROUTES.ONBOARDING}/business`} replace />;
  }

  return <>{children}</>;
};

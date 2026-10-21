import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWorkspaceStore } from "@/store/workspace.store";
import { ROUTES } from "@/constants/routes";
import { FullPageLoader } from "@/components/common/FullPageLoader";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** workspace pages need a finished onboarding; the onboarding wizard itself does not */
  requireOnboarding?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireOnboarding = true,
}) => {
  const { bootstrapStatus, isAuthenticated, onboardingComplete, onboardingResumeStep } = useWorkspaceStore();
  const location = useLocation();

  // the session is being rebuilt from the stored refresh token: never flash the sign-in page for it
  if (bootstrapStatus !== "ready") return <FullPageLoader />;

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />;
  }

  if (requireOnboarding && !onboardingComplete) {
    return <Navigate to={`${ROUTES.ONBOARDING}/${onboardingResumeStep}`} replace />;
  }

  // a finished business has nothing left to do in the wizard
  if (!requireOnboarding && onboardingComplete) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <>{children}</>;
};

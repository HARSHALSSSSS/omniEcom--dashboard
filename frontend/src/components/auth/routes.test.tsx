import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicOnlyRoute } from "./PublicOnlyRoute";
import { useWorkspaceStore } from "@/store/workspace.store";

const user = { id: "u1", fullName: "Aayush", email: "a@nova.test", businessName: "Nova", role: "owner" as const };

function signedIn(onboardingStatus: "in_progress" | "completed", resumeStep = "business") {
  useWorkspaceStore.getState().setSession({ user, permissions: [], shell: null, onboardingStatus, onboardingResumeStep: resumeStep });
  useWorkspaceStore.getState().setBootstrapStatus("ready");
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signin" element={<PublicOnlyRoute><div>sign-in page</div></PublicOnlyRoute>} />
        <Route path="/" element={<ProtectedRoute><div>workspace</div></ProtectedRoute>} />
        <Route path="/onboarding/:step" element={<ProtectedRoute requireOnboarding={false}><div>wizard</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().clearWorkspace();
    useWorkspaceStore.getState().setBootstrapStatus("idle");
  });

  it("shows a loader, never the sign-in page, while the session is being restored", () => {
    renderAt("/");
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("sign-in page")).not.toBeInTheDocument();
  });

  it("sends a visitor without a session to sign in", () => {
    useWorkspaceStore.getState().setBootstrapStatus("ready");
    renderAt("/");
    expect(screen.getByText("sign-in page")).toBeInTheDocument();
  });

  it("lets a finished business into the workspace", () => {
    signedIn("completed");
    renderAt("/");
    expect(screen.getByText("workspace")).toBeInTheDocument();
  });

  it("sends an unfinished business to the wizard step it stopped at", () => {
    signedIn("in_progress", "inventory");
    renderAt("/");
    expect(screen.getByText("wizard")).toBeInTheDocument();
  });

  it("keeps a finished business out of the wizard", () => {
    signedIn("completed");
    renderAt("/onboarding/business");
    expect(screen.getByText("workspace")).toBeInTheDocument();
  });

  it("keeps a signed-in person off the sign-in page", () => {
    signedIn("completed");
    renderAt("/signin");
    expect(screen.getByText("workspace")).toBeInTheDocument();
  });
});

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/globals.css";

async function prepare() {
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const { worker } = await import("./mocks/browser");
    // anything without a mock (auth, shell, notifications, search, and every integrated section) goes to the real API
    return worker.start({ onUnhandledRequest: "bypass" }).catch((error: unknown) => {
      // a browser that refuses the service worker must not take the whole app down: carry on against the real API
      console.warn("Mock service worker could not start; calling the real API only.", error);
    });
  }
  return Promise.resolve();
}

prepare().then(() => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Failed to find the root element");
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

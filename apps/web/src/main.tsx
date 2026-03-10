import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./tailwind.css";
import "./styles.css";

const hostname = window.location.hostname.toLowerCase();
const isTestHost = hostname.startsWith("test.") || hostname.includes(".test.");
document.title = isTestHost ? "Boltorezka (test)" : "Boltorezka";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

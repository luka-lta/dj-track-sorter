import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
    <Toaster theme="dark" richColors position="bottom-right" />
  </StrictMode>,
);

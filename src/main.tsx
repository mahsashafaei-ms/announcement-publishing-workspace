import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAnnouncementMock } from "./mocks";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App service={createAnnouncementMock()} />
  </StrictMode>,
);

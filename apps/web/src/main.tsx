import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app";
// The only place styles are imported. Tailwind generates classes from what this
// pulls in, so an app that never imports it renders unstyled and every class
// name silently does nothing.
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

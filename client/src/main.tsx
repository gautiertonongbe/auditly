import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { trpc, trpcClient, queryClient } from "./lib/trpc";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);

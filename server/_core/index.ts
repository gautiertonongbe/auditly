import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers/index";
import { createContext } from "./context";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

// tRPC
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.listen(PORT, () => {
  console.log(`[Auditly] Server running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;

import { router } from "../_core/trpc";
import { authRouter } from "./auth";
import { engagementsRouter } from "./engagements";
import { controlsRouter } from "./controls";
import { pbcRouter } from "./pbc";
import { workpapersRouter } from "./workpapers";
import { exceptionsRouter } from "./exceptions";
import { ipeRouter } from "./ipe";
import { sodRouter } from "./sod";
import { aiRouter } from "./ai";
import { exportRouter } from "./export";
import { auditTrailRouter } from "./auditTrail";

export const appRouter = router({
  auth: authRouter,
  engagements: engagementsRouter,
  controls: controlsRouter,
  pbc: pbcRouter,
  workpapers: workpapersRouter,
  exceptions: exceptionsRouter,
  ipe: ipeRouter,
  sod: sodRouter,
  ai: aiRouter,
  export: exportRouter,
  auditTrail: auditTrailRouter,
});

export type AppRouter = typeof appRouter;

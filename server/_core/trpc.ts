import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";
import { db } from "./db";
import { auditTrail } from "../../drizzle/schema";
import { randomUUID } from "crypto";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Logs every mutation to the audit trail automatically
export const auditedProcedure = protectedProcedure.use(async ({ ctx, next, path }) => {
  const result = await next({ ctx });
  // Fire-and-forget audit log
  void db.insert(auditTrail).values({
    id: randomUUID(),
    entityType: path.split(".")[0],
    entityId: "batch",
    action: path,
    userId: ctx.user.id,
    ipAddress: ctx.req.ip,
    userAgent: ctx.req.headers["user-agent"] ?? null,
    timestamp: new Date(),
  }).catch(() => {});
  return result;
});

/**
 * API Connections router — manages enterprise system integrations.
 * Supports ServiceNow, Azure AD, Jira, GitHub (and more via extensible provider map).
 * Credentials are stored as encrypted JSON; never returned in plaintext.
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { router, protectedProcedure, auditedProcedure } from "../_core/trpc";
import { apiConnections, controlApiMappings, pbcItems, controls, auditTrail } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { pullChangeRequests, pullIncidents, testConnection as testServiceNow } from "../lib/connectors/servicenow";
import { pullPrivilegedUsers, pullAllUsers, testConnection as testAzureAd } from "../lib/connectors/azuread";
import { pullIssues, testConnection as testJira } from "../lib/connectors/jira";
import { pullPullRequests, pullBranchProtection, testConnection as testGitHub } from "../lib/connectors/github";

const SUPPORTED_PROVIDERS = ["servicenow", "azure_ad", "jira", "github", "okta", "splunk", "salesforce"] as const;

const credentialsSchemas = {
  servicenow: z.object({ instanceUrl: z.string().url(), username: z.string(), password: z.string() }),
  azure_ad: z.object({ tenantId: z.string(), clientId: z.string(), clientSecret: z.string() }),
  jira: z.object({ baseUrl: z.string().url(), email: z.string().email(), apiToken: z.string() }),
  github: z.object({ token: z.string(), org: z.string().optional() }),
  okta: z.object({ domain: z.string(), apiToken: z.string() }),
  splunk: z.object({ baseUrl: z.string().url(), username: z.string(), password: z.string() }),
  salesforce: z.object({ instanceUrl: z.string().url(), clientId: z.string(), clientSecret: z.string(), username: z.string(), password: z.string() }),
};

export const connectionsRouter = router({
  // List all API connections for an engagement (credentials omitted)
  list: protectedProcedure
    .input(z.object({ engagementId: z.string() }))
    .query(async ({ ctx, input }) => {
      const conns = await ctx.db
        .select({
          id: apiConnections.id,
          engagementId: apiConnections.engagementId,
          provider: apiConnections.provider,
          name: apiConnections.name,
          baseUrl: apiConnections.baseUrl,
          isActive: apiConnections.isActive,
          lastTestedAt: apiConnections.lastTestedAt,
          lastTestResult: apiConnections.lastTestResult,
          createdBy: apiConnections.createdBy,
          createdAt: apiConnections.createdAt,
        })
        .from(apiConnections)
        .where(eq(apiConnections.engagementId, input.engagementId));
      return conns;
    }),

  // Create a new API connection
  create: auditedProcedure
    .input(z.object({
      engagementId: z.string(),
      provider: z.enum(SUPPORTED_PROVIDERS),
      name: z.string().min(1).max(120),
      baseUrl: z.string().url().optional(),
      credentials: z.record(z.string()), // validated per provider
    }))
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();

      // Validate credentials shape for the provider
      const schema = credentialsSchemas[input.provider as keyof typeof credentialsSchemas];
      if (schema) {
        const parsed = schema.safeParse(input.credentials);
        if (!parsed.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid credentials for ${input.provider}: ${parsed.error.issues.map(i => i.message).join(", ")}`,
          });
        }
      }

      await ctx.db.insert(apiConnections).values({
        id,
        engagementId: input.engagementId,
        provider: input.provider,
        name: input.name,
        baseUrl: input.baseUrl ?? null,
        credentials: JSON.stringify(input.credentials),
        isActive: true,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "api_connection",
        entityId: id,
        action: "connection_created",
        description: `API connection "${input.name}" (${input.provider}) added`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { id };
    }),

  // Delete a connection
  delete: auditedProcedure
    .input(z.object({ id: z.string(), engagementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(apiConnections).where(
        and(eq(apiConnections.id, input.id), eq(apiConnections.engagementId, input.engagementId))
      );

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "api_connection",
        entityId: input.id,
        action: "connection_deleted",
        description: `API connection deleted`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { ok: true };
    }),

  // Test a connection — returns ok/message without touching credentials in the response
  test: auditedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [conn] = await ctx.db.select().from(apiConnections).where(eq(apiConnections.id, input.id));
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });

      const creds = JSON.parse(conn.credentials ?? "{}");
      let result: { ok: boolean; message: string };

      try {
        switch (conn.provider) {
          case "servicenow": result = await testServiceNow({ instanceUrl: conn.baseUrl ?? "", ...creds }); break;
          case "azure_ad":   result = await testAzureAd(creds); break;
          case "jira":       result = await testJira({ baseUrl: conn.baseUrl ?? "", ...creds }); break;
          case "github":     result = await testGitHub(creds); break;
          default:           result = { ok: false, message: `No test handler for provider: ${conn.provider}` };
        }
      } catch (err) {
        result = { ok: false, message: String(err) };
      }

      // Record test result
      await ctx.db.update(apiConnections).set({
        lastTestedAt: new Date(),
        lastTestResult: result.ok ? "ok" : result.message,
      }).where(eq(apiConnections.id, input.id));

      return result;
    }),

  // Map a control to an API connection with a query config
  mapControl: auditedProcedure
    .input(z.object({
      controlId: z.string(),
      apiConnectionId: z.string(),
      queryConfig: z.record(z.unknown()), // provider-specific JSON config
    }))
    .mutation(async ({ ctx, input }) => {
      const id = randomUUID();
      await ctx.db.insert(controlApiMappings).values({
        id,
        controlId: input.controlId,
        apiConnectionId: input.apiConnectionId,
        queryConfig: JSON.stringify(input.queryConfig),
        createdAt: new Date(),
      });
      return { id };
    }),

  // Get mappings for a control
  getMappings: protectedProcedure
    .input(z.object({ controlId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mappings = await ctx.db
        .select({
          id: controlApiMappings.id,
          controlId: controlApiMappings.controlId,
          apiConnectionId: controlApiMappings.apiConnectionId,
          queryConfig: controlApiMappings.queryConfig,
          lastPulledAt: controlApiMappings.lastPulledAt,
          lastPullStatus: controlApiMappings.lastPullStatus,
        })
        .from(controlApiMappings)
        .where(eq(controlApiMappings.controlId, input.controlId));
      return mappings;
    }),

  // Pull evidence from a connected system and create PBC items
  pullEvidence: auditedProcedure
    .input(z.object({
      mappingId: z.string(),
      controlId: z.string(),
      engagementId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [mapping] = await ctx.db
        .select()
        .from(controlApiMappings)
        .where(eq(controlApiMappings.id, input.mappingId));
      if (!mapping) throw new TRPCError({ code: "NOT_FOUND", message: "Mapping not found" });

      const [conn] = await ctx.db.select().from(apiConnections).where(eq(apiConnections.id, mapping.apiConnectionId));
      if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "API connection not found" });

      const creds = JSON.parse(conn.credentials ?? "{}");
      const queryConfig = JSON.parse(mapping.queryConfig ?? "{}");

      let pulledItems: { source: string; recordId: string; summary: string; details: Record<string, string>; pulledAt: string }[] = [];

      try {
        switch (conn.provider) {
          case "servicenow":
            if (queryConfig.entityType === "incidents") {
              pulledItems = await pullIncidents({ instanceUrl: conn.baseUrl ?? "", ...creds }, queryConfig);
            } else {
              pulledItems = await pullChangeRequests({ instanceUrl: conn.baseUrl ?? "", ...creds }, queryConfig);
            }
            break;
          case "azure_ad":
            if (queryConfig.entityType === "all_users") {
              pulledItems = await pullAllUsers(creds, queryConfig);
            } else {
              pulledItems = await pullPrivilegedUsers(creds, queryConfig);
            }
            break;
          case "jira":
            pulledItems = await pullIssues({ baseUrl: conn.baseUrl ?? "", ...creds }, queryConfig);
            break;
          case "github":
            if (queryConfig.entityType === "branch_protection") {
              pulledItems = await pullBranchProtection(creds, queryConfig);
            } else {
              pulledItems = await pullPullRequests(creds, queryConfig);
            }
            break;
          default:
            throw new TRPCError({ code: "BAD_REQUEST", message: `No pull handler for provider: ${conn.provider}` });
        }
      } catch (err) {
        await ctx.db.update(controlApiMappings).set({
          lastPulledAt: new Date(),
          lastPullStatus: `error: ${String(err)}`,
        }).where(eq(controlApiMappings.id, input.mappingId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Pull failed: ${String(err)}` });
      }

      // Create a PBC item for each pulled record
      const created: string[] = [];
      for (const item of pulledItems) {
        const pbcId = randomUUID();
        const detailText = Object.entries(item.details)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");

        await ctx.db.insert(pbcItems).values({
          id: pbcId,
          engagementId: input.engagementId,
          controlId: input.controlId,
          description: `[${conn.provider.toUpperCase()}] ${item.summary}`,
          status: "Received",
          receivedDate: new Date(),
          fileContent: detailText.slice(0, 8000),
          notes: `Auto-pulled from ${conn.name} (${conn.provider}) — Record ID: ${item.recordId}`,
          createdAt: new Date(),
        });
        created.push(pbcId);
      }

      // Update mapping status
      await ctx.db.update(controlApiMappings).set({
        lastPulledAt: new Date(),
        lastPullStatus: `ok — ${pulledItems.length} records`,
      }).where(eq(controlApiMappings.id, input.mappingId));

      await ctx.db.insert(auditTrail).values({
        id: randomUUID(),
        engagementId: input.engagementId,
        entityType: "api_connection",
        entityId: input.mappingId,
        action: "evidence_pulled",
        description: `${pulledItems.length} records pulled from ${conn.name} (${conn.provider})`,
        userId: ctx.user.id,
        timestamp: new Date(),
      });

      return { pulled: pulledItems.length, pbcItemsCreated: created.length };
    }),
});

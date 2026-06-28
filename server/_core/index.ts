import express from "express";
import { join } from "path";
import { existsSync } from "fs";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers/index";
import { createContext } from "./context";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { portalTokens, pbcItems, controls, portalSuggestions, users, engagements, systems, engagementMembers, workpapers, ipeItems, exceptions, deficiencyAssessments, sodAnalyses, auditTrail } from "../../drizzle/schema";
import { buildSSORouter } from "../lib/sso";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "../lib/s3";
import { parseFileBuffer, getMimeType, classifyPbcFileAI } from "../lib/fileParser";
import { cloudConnections } from "../../drizzle/schema";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ── SOC 2 Rate Limiting ──────────────────────────────────────────────────────
// Auth routes: 10 attempts per 15 minutes per IP (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  skip: () => process.env.NODE_ENV === "test",
});

// File upload: 30 uploads per 10 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many file uploads. Please slow down." },
  skip: () => process.env.NODE_ENV === "test",
});

// General API: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// ── Boot-time migrations (MySQL/TiDB-compatible) ─────────────────────────────
void (async () => {
  const tryExec = async (statement: string) => {
    try { await db.execute(sql.raw(statement)); } catch { /* column/table already exists */ }
  };

  await tryExec(`
    CREATE TABLE IF NOT EXISTS portal_tokens (
      id VARCHAR(36) PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      engagement_id VARCHAR(36) NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT,
      created_by VARCHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`ALTER TABLE pbc_items ADD COLUMN file_content TEXT`);
  await tryExec(`ALTER TABLE pbc_items ADD COLUMN ai_classification TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN procedure_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN results_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN conclusion_template TEXT`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN template_id VARCHAR(36)`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN phase ENUM('TOD','TOE','Rollforward') NULL`);
  await tryExec(`ALTER TABLE workpapers ADD COLUMN rollforward_from_date DATETIME NULL`);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS workpaper_templates (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36),
      name TEXT NOT NULL,
      control_type TEXT,
      risk_level TEXT,
      framework TEXT DEFAULT 'PCAOB',
      procedure_template TEXT,
      results_template TEXT,
      conclusion_template TEXT,
      use_count INT NOT NULL DEFAULT 0,
      tags TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS api_connections (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT,
      credentials TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_tested_at DATETIME,
      last_test_result TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS control_api_mappings (
      id VARCHAR(36) PRIMARY KEY,
      control_id VARCHAR(36) NOT NULL,
      api_connection_id VARCHAR(36) NOT NULL,
      query_config TEXT,
      last_pulled_at DATETIME,
      last_pull_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS cloud_connections (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      email TEXT,
      display_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS control_folder_links (
      id VARCHAR(36) PRIMARY KEY,
      control_id VARCHAR(36) NOT NULL,
      cloud_connection_id VARCHAR(36) NOT NULL,
      folder_id TEXT NOT NULL,
      folder_name TEXT,
      folder_path TEXT,
      last_synced_at DATETIME,
      last_sync_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tryExec(`
    CREATE TABLE IF NOT EXISTS portal_suggestions (
      id VARCHAR(36) PRIMARY KEY,
      engagement_id VARCHAR(36) NOT NULL,
      portal_token_id VARCHAR(36) NOT NULL,
      client_name TEXT NOT NULL,
      process_name TEXT NOT NULL,
      system_name TEXT,
      description TEXT NOT NULL,
      contact_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      auditor_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    )
  `);
  await tryExec(`ALTER TABLE users ADD COLUMN sso_provider TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN sso_id TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN mfa_backup_codes TEXT`);
  await tryExec(`ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0`);
  await tryExec(`ALTER TABLE users ADD COLUMN locked_until DATETIME`);
  await tryExec(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`);
  await tryExec(`ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await tryExec(`ALTER TABLE users ADD COLUMN last_activity_at DATETIME`);
  console.log("[Migration] Boot-time migrations complete");

  // Seed default admin user if none exists
  let adminId: string;
  try {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length === 0) {
      const passwordHash = await bcrypt.hash("Auditly2025!", 12);
      adminId = randomUUID();
      await db.insert(users).values({
        id: adminId,
        email: "admin@auditly.io",
        name: "Admin User",
        role: "admin",
        passwordHash,
        createdAt: new Date(),
      });
      console.log("[Seed] Created default admin: admin@auditly.io");
    } else {
      adminId = existing[0].id;
    }
  } catch (e) {
    console.warn("[Seed] Could not seed admin user:", e);
    adminId = "";
  }

  // Seed demo engagement + controls if none exist
  try {
    if (!adminId) throw new Error("No admin ID");
    const existingEngs = await db.select({ id: engagements.id }).from(engagements).limit(1);
    if (existingEngs.length === 0) {
      {

      // ── Seed demo engagement ──────────────────────────────────────────────
      const engId = randomUUID();
      await db.insert(engagements).values({
        id: engId,
        clientName: "Acme Corp",
        clientIndustry: "Technology",
        fiscalYear: 2024,
        periodStart: new Date("2024-01-01"),
        periodEnd: new Date("2024-12-31"),
        status: "fieldwork",
        framework: "PCAOB",
        createdBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(engagementMembers).values({
        id: randomUUID(),
        engagementId: engId,
        userId: adminId,
        role: "admin",
        assignedAt: new Date(),
      });

      // ── Seed in-scope systems ─────────────────────────────────────────────
      const erpId = randomUUID();
      const osId = randomUUID();
      const dbId = randomUUID();
      const cloudId = randomUUID();
      const appId = randomUUID();
      await db.insert(systems).values([
        { id: erpId,   engagementId: engId, name: "SAP S/4HANA",      type: "ERP",         vendor: "SAP",       version: "2023", inScope: true, createdAt: new Date() },
        { id: osId,    engagementId: engId, name: "Windows Server",    type: "OS",          vendor: "Microsoft", version: "2022", inScope: true, createdAt: new Date() },
        { id: dbId,    engagementId: engId, name: "SQL Server",        type: "Database",    vendor: "Microsoft", version: "2019", inScope: true, createdAt: new Date() },
        { id: cloudId, engagementId: engId, name: "AWS Production",    type: "Cloud",       vendor: "Amazon",    version: "N/A",  inScope: true, createdAt: new Date() },
        { id: appId,   engagementId: engId, name: "Salesforce CRM",    type: "Application", vendor: "Salesforce",version: "Spring 24", inScope: true, createdAt: new Date() },
      ]);

      // ── ITGC – Change Management (CM) ─────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "CM", controlRef: "CM-01",
          objective: "Ensure all changes to the ERP are properly authorized before implementation.",
          description: "The change management committee reviews and approves all change requests to SAP S/4HANA prior to deployment. Approvals are documented in the change ticket system with evidence of sign-off by the IT manager and process owner.",
          frequency: "Monthly", riskLevel: "High", status: "InProgress",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "CM", controlRef: "CM-02",
          objective: "Ensure changes are tested in a non-production environment before go-live.",
          description: "All changes to in-scope systems are deployed to UAT/staging before production. Test results and sign-off from the business owner are required before the change is promoted to production.",
          frequency: "Monthly", riskLevel: "High", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: appId,
          domain: "ITGC", itgcType: "CM", controlRef: "CM-03",
          objective: "Ensure emergency changes follow an expedited but controlled process.",
          description: "Emergency changes to Salesforce CRM follow an expedited approval process requiring at least one IT manager approval. Retrospective documentation is completed within 48 hours.",
          frequency: "Continuous", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITGC – Access Management (AM) ─────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "AM", controlRef: "AM-01",
          objective: "Ensure user access to SAP is provisioned based on the principle of least privilege.",
          description: "User access requests are reviewed and approved by the relevant business process owner before provisioning. Role assignments are documented and access is limited to job function requirements.",
          frequency: "Continuous", riskLevel: "High", status: "UnderReview",
          elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "AM", controlRef: "AM-02",
          objective: "Ensure periodic review of user access rights to detect and remove inappropriate access.",
          description: "Management performs a quarterly user access review of all SAP roles. Accounts with inappropriate access are revoked within 5 business days of identification.",
          frequency: "Quarterly", riskLevel: "High", status: "Complete",
          priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: dbId,
          domain: "ITGC", itgcType: "AM", controlRef: "AM-03",
          objective: "Ensure privileged database access is restricted and monitored.",
          description: "DBA accounts on SQL Server are limited to the database team. All privileged access sessions are logged and reviewed weekly by the IT security team.",
          frequency: "Daily", riskLevel: "High", status: "InProgress",
          elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "AM", controlRef: "AM-04",
          objective: "Ensure terminated employees are promptly removed from all in-scope systems.",
          description: "HR triggers an automated workflow upon termination that disables all system accounts within 24 hours. IT confirms account deactivation and documents evidence in the ITSM ticket.",
          frequency: "Continuous", riskLevel: "High", status: "Complete",
          priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITGC – Computer Operations (CO) ──────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: cloudId,
          domain: "ITGC", itgcType: "CO", controlRef: "CO-01",
          objective: "Ensure automated batch jobs complete successfully and exceptions are investigated.",
          description: "AWS batch job completion logs are reviewed daily by the operations team. Failed jobs trigger automated alerts and are investigated and resolved within 4 hours.",
          frequency: "Daily", riskLevel: "Medium", status: "Complete",
          priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: cloudId,
          domain: "ITGC", itgcType: "CO", controlRef: "CO-02",
          objective: "Ensure data backups are performed and restoration capability is periodically tested.",
          description: "Critical data backups run nightly in AWS. Monthly restore tests are performed by the IT team to verify backup integrity. Results are documented and reviewed by IT management.",
          frequency: "Monthly", riskLevel: "High", status: "InProgress",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: osId,
          domain: "ITGC", itgcType: "CO", controlRef: "CO-03",
          objective: "Ensure security patches are applied timely to in-scope operating systems.",
          description: "Windows Server patches are applied within 30 days of release for critical patches and 90 days for non-critical. Patch compliance reports are reviewed monthly by IT security.",
          frequency: "Monthly", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITGC – Program Development (PD) ──────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITGC", itgcType: "PD", controlRef: "PD-01",
          objective: "Ensure new systems and major enhancements follow a structured SDLC methodology.",
          description: "All new development projects follow the company's SDLC, including requirements definition, design review, testing, and sign-off. Project documentation is retained in the project repository.",
          frequency: "Annual", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: appId,
          domain: "ITGC", itgcType: "PD", controlRef: "PD-02",
          objective: "Ensure user acceptance testing is completed and approved prior to system go-live.",
          description: "UAT is conducted by business process owners for all new implementations. Formal UAT sign-off is required before production deployment.",
          frequency: "Annual", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITAC – Input Controls ─────────────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITAC", itacType: "Input", controlRef: "AC-IN-01",
          objective: "Ensure only complete and accurate data is entered into the accounts payable module.",
          description: "SAP enforces mandatory field validation on vendor invoices (vendor number, PO reference, amount, currency, tax code). Incomplete entries are rejected with an error message.",
          frequency: "Continuous", riskLevel: "High", status: "InProgress",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: appId,
          domain: "ITAC", itacType: "Input", controlRef: "AC-IN-02",
          objective: "Ensure duplicate purchase orders cannot be entered into the system.",
          description: "Salesforce enforces duplicate detection rules on opportunity records. Matching records based on account + amount + close date trigger a duplicate alert requiring override justification.",
          frequency: "Continuous", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITAC – Processing Controls ────────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITAC", itacType: "Processing", controlRef: "AC-PR-01",
          objective: "Ensure the three-way match (PO, GR, Invoice) is enforced before payment processing.",
          description: "SAP automatically performs a three-way match before approving invoices for payment. Invoices that fail the tolerance check (qty or price variance > 5%) are routed to an exception queue for manual review.",
          frequency: "Continuous", riskLevel: "High", status: "Exception",
          priorYearResult: "ExceptionNoted", elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITAC", itacType: "Processing", controlRef: "AC-PR-02",
          objective: "Ensure calculation of depreciation charges is accurate and complete.",
          description: "SAP Fixed Assets module automatically calculates depreciation based on predefined asset class rules. Depreciation runs are reviewed monthly by the accounting team against the prior month variance report.",
          frequency: "Monthly", riskLevel: "High", status: "InProgress",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITAC – Output Controls ────────────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITAC", itacType: "Output", controlRef: "AC-OUT-01",
          objective: "Ensure financial reports generated by the ERP are complete, accurate, and reconciled.",
          description: "The monthly trial balance report from SAP is reconciled to the general ledger by the accounting team. Reconciling items exceeding $10,000 require documented explanations and management approval.",
          frequency: "Monthly", riskLevel: "High", status: "Complete",
          priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: appId,
          domain: "ITAC", itacType: "Output", controlRef: "AC-OUT-02",
          objective: "Ensure revenue reports distributed to management reflect accurate pipeline data.",
          description: "Salesforce CRM revenue pipeline reports are generated and distributed to CFO and VP of Sales weekly. The report distribution list is reviewed quarterly to ensure only authorized recipients receive it.",
          frequency: "Monthly", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── ITAC – Interface Controls ─────────────────────────────────────────
      await db.insert(controls).values([
        {
          id: randomUUID(), engagementId: engId, systemId: erpId,
          domain: "ITAC", itacType: "Interface", controlRef: "AC-IF-01",
          objective: "Ensure data transferred between Salesforce CRM and SAP ERP is complete and accurate.",
          description: "Automated interface runs nightly to transfer closed opportunities from Salesforce to SAP revenue module. Reconciliation reports compare record counts and totals between systems. Exceptions are investigated by the IT team within 24 hours.",
          frequency: "Daily", riskLevel: "High", status: "InProgress",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, systemId: dbId,
          domain: "ITAC", itacType: "Interface", controlRef: "AC-IF-02",
          objective: "Ensure the data warehouse receives complete and accurate feeds from source systems.",
          description: "ETL jobs from SQL Server to the data warehouse run nightly. Row count and checksum reconciliations are performed automatically. Failures alert the data engineering team within 30 minutes.",
          frequency: "Daily", riskLevel: "Medium", status: "NotStarted",
          elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      console.log("[Seed] Created demo engagement 'Acme Corp FY2024' with 20 controls (ITGC: CM/AM/CO/PD, ITAC: Input/Processing/Output/Interface)");
      }
    }
  } catch (e) {
    console.warn("[Seed] Could not seed demo data:", e);
  }

  // ── Seed NetSuite engagements ──────────────────────────────────────────────
  try {
    if (!adminId) throw new Error("No admin ID");
    const existingNS = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.clientName, "Meridian Healthcare")).limit(1);
    if (existingNS.length === 0) {

      const nsClients = [
        { name: "Meridian Healthcare",    industry: "Healthcare",     fy: 2024, status: "fieldwork" as const, start: "2024-01-01", end: "2024-12-31" },
        { name: "Pacific Retail Group",   industry: "Retail",         fy: 2024, status: "review"    as const, start: "2024-01-01", end: "2024-12-31" },
        { name: "Global Logistics Co",    industry: "Transportation",  fy: 2023, status: "complete"  as const, start: "2023-01-01", end: "2023-12-31" },
        { name: "Summit Manufacturing",   industry: "Manufacturing",   fy: 2025, status: "planning"  as const, start: "2025-01-01", end: "2025-12-31" },
        { name: "Coastal Properties LLC", industry: "Real Estate",     fy: 2024, status: "fieldwork" as const, start: "2024-01-01", end: "2024-12-31" },
      ];

      for (const client of nsClients) {
        const engId = randomUUID();
        await db.insert(engagements).values({
          id: engId, clientName: client.name, clientIndustry: client.industry,
          fiscalYear: client.fy, periodStart: new Date(client.start), periodEnd: new Date(client.end),
          status: client.status, framework: "PCAOB", createdBy: adminId,
          createdAt: new Date(), updatedAt: new Date(),
        });
        await db.insert(engagementMembers).values({ id: randomUUID(), engagementId: engId, userId: adminId, role: "admin", assignedAt: new Date() });

        const nsErpId = randomUUID();
        const nsDbId  = randomUUID();
        const nsCloudId = randomUUID();
        await db.insert(systems).values([
          { id: nsErpId,   engagementId: engId, name: "NetSuite ERP",    type: "ERP",      vendor: "Oracle",    version: "2024.1", inScope: true, createdAt: new Date() },
          { id: nsDbId,    engagementId: engId, name: "Oracle DB",       type: "Database", vendor: "Oracle",    version: "19c",    inScope: true, createdAt: new Date() },
          { id: nsCloudId, engagementId: engId, name: "AWS Production",  type: "Cloud",    vendor: "Amazon",    version: "N/A",    inScope: true, createdAt: new Date() },
        ]);

        await db.insert(controls).values([
          {
            id: randomUUID(), engagementId: engId, systemId: nsErpId,
            domain: "ITGC", itgcType: "AM", controlRef: "NS-AM-01",
            objective: "Ensure NetSuite role assignments are approved and aligned to job function.",
            description: "Access requests to NetSuite roles (A/P, A/R, GL, Admin) require approval from the relevant department head and IT. Provisioning is performed by the IT team and documented in the ITSM system.",
            frequency: "Continuous", riskLevel: "High", status: client.status === "complete" ? "Complete" : "InProgress",
            elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: nsErpId,
            domain: "ITGC", itgcType: "AM", controlRef: "NS-AM-02",
            objective: "Ensure quarterly recertification of NetSuite user access is performed.",
            description: "Department managers recertify all NetSuite user access quarterly. Accounts not recertified within 10 business days are automatically suspended.",
            frequency: "Quarterly", riskLevel: "High", status: client.status === "complete" ? "Complete" : "NotStarted",
            priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: nsErpId,
            domain: "ITGC", itgcType: "CM", controlRef: "NS-CM-01",
            objective: "Ensure all SuiteScript customizations and configuration changes are authorized before deployment.",
            description: "Changes to NetSuite (SuiteScripts, saved searches, workflows, custom fields) follow a formal change request process. The IT manager and CFO approve changes affecting financial modules.",
            frequency: "Monthly", riskLevel: "High", status: client.status === "complete" ? "Complete" : "InProgress",
            elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: nsErpId,
            domain: "ITAC", itacType: "Processing", controlRef: "NS-AC-PR-01",
            objective: "Ensure revenue recognition is calculated correctly by the NetSuite ARM module.",
            description: "NetSuite Advanced Revenue Management module applies ASC 606 rules to recognize revenue based on performance obligation completion. Finance reviews the monthly revenue waterfall report against executed contracts.",
            frequency: "Monthly", riskLevel: "High", status: client.status === "complete" ? "Complete" : "UnderReview",
            elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: nsErpId,
            domain: "ITAC", itacType: "Interface", controlRef: "NS-AC-IF-01",
            objective: "Ensure payroll data from the HRIS is accurately transferred to NetSuite for journal entry posting.",
            description: "Nightly payroll interface transfers gross pay, taxes, and deductions from ADP to NetSuite GL. The payroll manager reconciles ADP pay registers to NetSuite journal entries each pay period.",
            frequency: "Monthly", riskLevel: "High", status: client.status === "complete" ? "Complete" : "InProgress",
            elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
        ]);
      }
      console.log("[Seed] Created 5 NetSuite engagements with controls");
    }
  } catch (e) {
    console.warn("[Seed] Could not seed NetSuite engagements:", e);
  }

  // ── Seed Coupa engagements ─────────────────────────────────────────────────
  try {
    if (!adminId) throw new Error("No admin ID");
    const existingCoupa = await db.select({ id: engagements.id }).from(engagements).where(eq(engagements.clientName, "TechGiant Inc")).limit(1);
    if (existingCoupa.length === 0) {

      const coupaClients = [
        { name: "TechGiant Inc",          industry: "Technology",      fy: 2024, status: "fieldwork" as const, start: "2024-01-01", end: "2024-12-31" },
        { name: "Apex Financial Services", industry: "Financial Services", fy: 2024, status: "review" as const, start: "2024-01-01", end: "2024-12-31" },
        { name: "Vertex Energy Corp",      industry: "Energy",           fy: 2023, status: "complete" as const, start: "2023-01-01", end: "2023-12-31" },
        { name: "Cascade Healthcare Sys",  industry: "Healthcare",       fy: 2025, status: "planning" as const, start: "2025-01-01", end: "2025-12-31" },
        { name: "Horizon Media Group",     industry: "Media",            fy: 2024, status: "fieldwork" as const, start: "2024-01-01", end: "2024-12-31" },
      ];

      for (const client of coupaClients) {
        const engId = randomUUID();
        await db.insert(engagements).values({
          id: engId, clientName: client.name, clientIndustry: client.industry,
          fiscalYear: client.fy, periodStart: new Date(client.start), periodEnd: new Date(client.end),
          status: client.status, framework: "PCAOB", createdBy: adminId,
          createdAt: new Date(), updatedAt: new Date(),
        });
        await db.insert(engagementMembers).values({ id: randomUUID(), engagementId: engId, userId: adminId, role: "admin", assignedAt: new Date() });

        const coupaAppId = randomUUID();
        const coupaErpId = randomUUID();
        const coupaIdpId = randomUUID();
        await db.insert(systems).values([
          { id: coupaAppId, engagementId: engId, name: "Coupa P2P",        type: "Application", vendor: "Coupa",    version: "R44",    inScope: true, createdAt: new Date() },
          { id: coupaErpId, engagementId: engId, name: "SAP S/4HANA",      type: "ERP",         vendor: "SAP",      version: "2023",   inScope: true, createdAt: new Date() },
          { id: coupaIdpId, engagementId: engId, name: "Okta SSO",         type: "Application", vendor: "Okta",     version: "N/A",    inScope: true, createdAt: new Date() },
        ]);

        await db.insert(controls).values([
          {
            id: randomUUID(), engagementId: engId, systemId: coupaAppId,
            domain: "ITGC", itgcType: "AM", controlRef: "CPA-AM-01",
            objective: "Ensure Coupa user roles (Requester, Approver, AP Clerk, Admin) are provisioned based on approved access requests.",
            description: "Coupa user provisioning is triggered by an approved ServiceNow ticket. Roles are assigned per the Coupa RACI matrix. IT reviews monthly provisioning logs for unauthorized access.",
            frequency: "Continuous", riskLevel: "High", status: client.status === "complete" ? "Complete" : "InProgress",
            elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: coupaAppId,
            domain: "ITGC", itgcType: "CM", controlRef: "CPA-CM-01",
            objective: "Ensure changes to Coupa approval chains, commodity codes, and business groups are authorized.",
            description: "Configuration changes in Coupa (approval chains, suppliers, PO tolerances, GL coding rules) require a change request approved by the VP of Procurement and IT. Changes are tested in Coupa's sandbox before production.",
            frequency: "Monthly", riskLevel: "High", status: client.status === "complete" ? "Complete" : "InProgress",
            elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: coupaAppId,
            domain: "ITAC", itacType: "Processing", controlRef: "CPA-AC-PR-01",
            objective: "Ensure purchase orders require a complete approval chain before being issued to suppliers.",
            description: "Coupa enforces a multi-level approval workflow based on spend amount, commodity, and cost center. POs that bypass approval routing are blocked by the system. Approval logs are reviewed weekly by Procurement.",
            frequency: "Continuous", riskLevel: "High", status: client.status === "complete" ? "Complete" : client.status === "planning" ? "NotStarted" : "InProgress",
            priorYearResult: "Pass", elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: coupaAppId,
            domain: "ITAC", itacType: "Input", controlRef: "CPA-AC-IN-01",
            objective: "Ensure only approved suppliers can be selected when creating requisitions.",
            description: "Coupa's supplier portal enforces that only suppliers in Approved status can be added to a requisition. New supplier onboarding requires legal, tax, and procurement team sign-off before the supplier is activated.",
            frequency: "Continuous", riskLevel: "Medium", status: client.status === "complete" ? "Complete" : "NotStarted",
            elevatedSample: false, createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: randomUUID(), engagementId: engId, systemId: coupaAppId,
            domain: "ITAC", itacType: "Interface", controlRef: "CPA-AC-IF-01",
            objective: "Ensure approved invoices in Coupa are accurately transferred to SAP for payment processing.",
            description: "Coupa-to-SAP integration transfers approved invoices via API nightly. AP team reconciles Coupa payment status report to SAP open items weekly. Exceptions are resolved within 3 business days.",
            frequency: "Daily", riskLevel: "High", status: client.status === "complete" ? "Complete" : "UnderReview",
            elevatedSample: true, createdAt: new Date(), updatedAt: new Date(),
          },
        ]);
      }
      console.log("[Seed] Created 5 Coupa engagements with controls");
    }
  } catch (e) {
    console.warn("[Seed] Could not seed Coupa engagements:", e);
  }

  // ── Seed workpapers, PBC, IPE, exceptions, deficiency, SOD, audit trail ────
  try {
    if (!adminId) throw new Error("No admin ID");
    const existingWP = await db.select({ id: workpapers.id }).from(workpapers).limit(1);
    if (existingWP.length === 0) {
      const [acmeEng] = await db.select({ id: engagements.id }).from(engagements)
        .where(eq(engagements.clientName, "Acme Corp")).limit(1);
      if (!acmeEng) throw new Error("Acme Corp engagement not found — skipping workpaper seed");
      const engId = acmeEng.id;

      // Index Acme controls by ref
      const ctlRows = await db.select({ id: controls.id, controlRef: controls.controlRef })
        .from(controls).where(eq(controls.engagementId, engId));
      const ctlMap: Record<string, string> = {};
      for (const c of ctlRows) ctlMap[c.controlRef] = c.id;

      // Pre-generate workpaper IDs so exceptions can reference them
      const wpIds: Record<string, string> = {};
      for (const ref of ["AM-01", "CM-01", "CO-01", "AC-PR-01", "AC-IN-01"]) {
        if (ctlMap[ref]) wpIds[ref] = randomUUID();
      }

      // ── Workpapers ─────────────────────────────────────────────────────
      if (wpIds["AM-01"]) await db.insert(workpapers).values({
        id: wpIds["AM-01"], controlId: ctlMap["AM-01"], engagementId: engId,
        populationDescription: "All active SAP S/4HANA user accounts as of 12/31/2024",
        populationCount: 342, populationPeriod: "FY2024", sampleSize: 25, samplingMethod: "Random statistical",
        procedureFinal: "1. Obtained population of 342 active SAP user accounts from SUIM report (IPE tested).\n2. Selected random sample of 25 accounts.\n3. For each, inspected the access request ticket confirming business owner approval prior to provisioning.\n4. Confirmed SAP role assignments match approved roles in the ticket.\n5. Verified access is aligned with current job function per HR records.",
        resultsFinal: "24 of 25 accounts had complete access request documentation with process owner approval. Account JSMITH had an incomplete ticket missing the owner signature — management provided retrospective approval. This is an isolated administrative exception.",
        conclusionFinal: "Control operating effectively with one isolated administrative exception. Control conclusion: PASS.",
        conclusion: "Pass", preparedBy: adminId, preparedAt: new Date("2024-11-15"),
        reviewedBy: adminId, reviewedAt: new Date("2024-11-18"), reviewNotes: "Reviewed — concur with pass conclusion. Exception is immaterial.",
        createdAt: new Date(), updatedAt: new Date(),
      });

      if (wpIds["CM-01"]) await db.insert(workpapers).values({
        id: wpIds["CM-01"], controlId: ctlMap["CM-01"], engagementId: engId,
        populationDescription: "All 87 change requests to SAP approved in FY2024",
        populationCount: 87, populationPeriod: "FY2024", sampleSize: 20, samplingMethod: "Judgmental (all high-risk + random low-risk)",
        procedureFinal: "1. Obtained change management log from ServiceNow (IPE tested — 87 changes).\n2. Selected all 12 high-risk + 8 random low-risk changes.\n3. Inspected each ticket for: (a) IT manager approval, (b) process owner approval, (c) UAT evidence prior to go-live.",
        resultsFinal: "All 20 tickets had documented IT manager and process owner approvals. 19/20 had UAT evidence before production. One emergency change (CHG-2024-0341) went directly to production during a critical outage — retrospective sign-off obtained within 48 hrs per policy.",
        conclusionFinal: "Change management control operating effectively. Emergency change followed expedited process per policy. Control conclusion: PASS.",
        conclusion: "Pass", preparedBy: adminId, preparedAt: new Date("2024-10-20"),
        createdAt: new Date(), updatedAt: new Date(),
      });

      if (wpIds["CO-01"]) await db.insert(workpapers).values({
        id: wpIds["CO-01"], controlId: ctlMap["CO-01"], engagementId: engId,
        populationDescription: "All AWS batch job runs in FY2024 (365 daily runs)",
        populationCount: 365, populationPeriod: "FY2024", sampleSize: 15, samplingMethod: "Random sample across 4 quarters",
        procedureFinal: "1. Obtained AWS CloudWatch batch job completion report for 365 runs.\n2. Selected 15 random days across all quarters.\n3. Inspected job completion logs for each day.\n4. For any failures, verified automated alert was sent and job resolved within 4-hour SLA.",
        resultsFinal: "All 15 sampled days showed successful completions. 3 failures in full population (0.8% failure rate) — all resolved within 2-3 hours, meeting the 4-hour SLA.",
        conclusionFinal: "Computer operations control operating effectively. Control conclusion: PASS.",
        conclusion: "Pass", preparedBy: adminId, preparedAt: new Date("2024-11-01"),
        reviewedBy: adminId, reviewedAt: new Date("2024-11-05"), reviewNotes: "Reviewed and concur.",
        createdAt: new Date(), updatedAt: new Date(),
      });

      if (wpIds["AC-PR-01"]) await db.insert(workpapers).values({
        id: wpIds["AC-PR-01"], controlId: ctlMap["AC-PR-01"], engagementId: engId,
        populationDescription: "All 4,217 vendor invoices processed through SAP AP in FY2024",
        populationCount: 4217, populationPeriod: "FY2024", sampleSize: 60, samplingMethod: "Random statistical (95% confidence, 5% tolerable rate)",
        procedureFinal: "1. Obtained population of 4,217 invoices from SAP AP extract (IPE tested).\n2. Selected 60 invoices via random number generation.\n3. For each, obtained SAP screenshot showing three-way match result.\n4. Verified exception-queue invoices had documented manual review sign-off.\n5. Confirmed no tolerance override (>5% price/qty variance) was approved without written justification.",
        resultsFinal: "57 of 60 invoices demonstrated proper three-way match. 3 exception-queue invoices (INV-2024-1892, INV-2024-2341, INV-2024-3017) lacked documented approver name. 2 invoices (INV-2024-0887, INV-2024-1204) approved with 7% price variance without override justification. Exception rate: 8.3%, exceeding 5% tolerable rate.",
        conclusionFinal: "Three-way match control has exceptions noted. Exception rate exceeds tolerable rate. Exceptions referred to exception log. Control conclusion: EXCEPTION NOTED.",
        conclusion: "ExceptionNoted", preparedBy: adminId, preparedAt: new Date("2024-11-20"),
        createdAt: new Date(), updatedAt: new Date(),
      });

      if (wpIds["AC-IN-01"]) await db.insert(workpapers).values({
        id: wpIds["AC-IN-01"], controlId: ctlMap["AC-IN-01"], engagementId: engId,
        populationDescription: "All 4,217 AP invoice entries in SAP FY2024",
        populationCount: 4217, populationPeriod: "FY2024", sampleSize: 40, samplingMethod: "Random statistical",
        procedureFinal: "1. Selected 40 invoices from the AP population.\n2. Verified all mandatory fields (vendor number, PO reference, amount, currency, tax code) were populated.\n3. Reviewed error logs confirming SAP rejected attempts with missing mandatory fields.",
        resultsFinal: "All 40 sampled invoices had all mandatory fields populated. Error logs showed 14 rejected attempts during the year, confirming the control is operating as designed.",
        conclusionFinal: "Input validation control operating effectively. Control conclusion: PASS.",
        conclusion: "Pass", preparedBy: adminId, preparedAt: new Date("2024-11-10"),
        createdAt: new Date(), updatedAt: new Date(),
      });

      // ── PBC Items ──────────────────────────────────────────────────────
      const pbc1Id = randomUUID();
      const pbc3Id = randomUUID();
      const pbc4Id = randomUUID();
      await db.insert(pbcItems).values([
        {
          id: pbc1Id, engagementId: engId, controlId: ctlMap["AM-01"] ?? null,
          description: "Population of all active SAP user accounts as of 12/31/2024 (SUIM export: username, role assignments, last login, department)",
          requestedDate: new Date("2024-10-01"), dueDate: new Date("2024-10-15"), receivedDate: new Date("2024-10-12"),
          status: "Accepted", fileName: "SAP_Active_Users_20241231.xlsx",
          isIpe: true, notes: "Row count of 342 matches Active Directory user sync.", createdAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, controlId: ctlMap["AM-01"] ?? null,
          description: "Access request tickets for 25 sampled user accounts (business owner approval evidence)",
          requestedDate: new Date("2024-10-15"), dueDate: new Date("2024-10-22"), receivedDate: new Date("2024-10-21"),
          status: "Accepted", fileName: "Access_Request_Tickets_Sample.pdf",
          isIpe: false, notes: "All 25 tickets received. JSMITH ticket flagged — retrospective approval obtained.", createdAt: new Date(),
        },
        {
          id: pbc3Id, engagementId: engId, controlId: ctlMap["CM-01"] ?? null,
          description: "FY2024 change management log from ServiceNow (all change requests, approvers, UAT evidence, deployment dates)",
          requestedDate: new Date("2024-10-01"), dueDate: new Date("2024-10-15"), receivedDate: new Date("2024-10-14"),
          status: "Accepted", fileName: "Change_Log_FY2024.csv",
          isIpe: true, notes: "Population of 87 changes confirmed against ServiceNow dashboard.", createdAt: new Date(),
        },
        {
          id: pbc4Id, engagementId: engId, controlId: ctlMap["AC-PR-01"] ?? null,
          description: "Complete vendor invoice population from SAP — 4,217 invoices with PO number, GR number, match status, and exception queue flag",
          requestedDate: new Date("2024-11-01"), dueDate: new Date("2024-11-08"), receivedDate: new Date("2024-11-07"),
          status: "Accepted", fileName: "AP_Invoice_Population_FY2024.xlsx",
          isIpe: true, notes: "Row count 4,217 reconciled to AP sub-ledger closing balance.", createdAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, controlId: ctlMap["CO-02"] ?? null,
          description: "Monthly backup restoration test results for FY2024 (12 months): test date, tester, backup date restored, result, IT management sign-off",
          requestedDate: new Date("2024-10-15"), dueDate: new Date("2024-10-29"),
          status: "Requested", isIpe: false, notes: "Follow-up sent 10/22. Client delayed — Q3 close activity.", createdAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, controlId: ctlMap["AM-04"] ?? null,
          description: "FY2024 HR termination listing with corresponding ITSM ticket evidence of account deactivation within 24 hours",
          requestedDate: new Date("2024-11-05"), dueDate: new Date("2024-11-12"), receivedDate: new Date("2024-11-11"),
          status: "Accepted", fileName: "HR_Terminations_FY2024_with_IT_Tickets.pdf",
          isIpe: false, notes: "48 terminations. All matched to closed ITSM deactivation tickets.", createdAt: new Date(),
        },
      ]);

      // ── IPE Items ──────────────────────────────────────────────────────
      await db.insert(ipeItems).values([
        {
          id: randomUUID(), engagementId: engId, pbcItemId: pbc1Id,
          reportName: "SAP Active User Extract (SUIM — SU01D)", system: "SAP S/4HANA",
          parameters: "As of 12/31/2024; User Status = Active; All company codes",
          runDate: new Date("2024-12-31"), runBy: "IT Security — M. Chen",
          completenessStatus: "Pass", completenessNotes: "342 rows match Active Directory sync export of 342 active users.",
          accuracyStatus: "Pass", accuracyNotes: "Re-ran identical query; row counts and role assignments match submitted file.",
          linkedControls: [ctlMap["AM-01"]].filter(Boolean),
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, pbcItemId: pbc3Id,
          reportName: "ServiceNow Change Management Log Export", system: "ServiceNow ITSM",
          parameters: "FY2024 (Jan 1 – Dec 31 2024); Type = Normal, Emergency; Status = Closed",
          runDate: new Date("2025-01-05"), runBy: "IT Ops — J. Patel",
          completenessStatus: "Pass", completenessNotes: "87 change records reconciled to ServiceNow dashboard count.",
          accuracyStatus: "Pass", accuracyNotes: "Traced 5 sample records to underlying ServiceNow tickets — all fields agree.",
          linkedControls: [ctlMap["CM-01"], ctlMap["CM-02"]].filter(Boolean),
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: randomUUID(), engagementId: engId, pbcItemId: pbc4Id,
          reportName: "SAP AP Invoice Population Extract", system: "SAP S/4HANA",
          parameters: "FY2024; Company Code US01; Doc Type = RE (Vendor Invoice); Posting Status = Posted",
          runDate: new Date("2025-01-06"), runBy: "Finance — A. Rodriguez",
          completenessStatus: "Pass", completenessNotes: "4,217 invoices reconciled to AP sub-ledger closing balance per trial balance.",
          accuracyStatus: "Pass", accuracyNotes: "Agreed 10 invoices to source PO and GR documents — all fields accurate.",
          linkedControls: [ctlMap["AC-PR-01"], ctlMap["AC-IN-01"]].filter(Boolean),
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      // ── Exceptions (only if AC-PR-01 workpaper was seeded) ────────────
      if (wpIds["AC-PR-01"]) {
        const exc1Id = randomUUID();
        const exc2Id = randomUUID();
        await db.insert(exceptions).values([
          {
            id: exc1Id, workpaperId: wpIds["AC-PR-01"], controlId: ctlMap["AC-PR-01"], engagementId: engId,
            description: "Three invoices in the SAP exception queue lacked documented manual review sign-off — approver name absent for INV-2024-1892, INV-2024-2341, and INV-2024-3017.",
            rootCause: "SAP exception queue approval workflow was not configured to enforce a mandatory approver name field. AP team verbally approved invoices without entering their user ID into the system.",
            severity: "SignificantDeficiency",
            managementResponse: "SAP configuration updated to make approver field mandatory. AP team retrained on updated procedures in December 2024.",
            remediationPlan: "1. SAP config update to enforce mandatory approver field (Completed Q4 2024). 2. AP team retraining (Dec 2024). 3. Management monthly review of exception queue for 6 months.",
            remediationDueDate: new Date("2025-03-31"),
            status: "PendingRetest", raisedBy: adminId, raisedAt: new Date("2024-11-25"),
            createdAt: new Date(), updatedAt: new Date(),
          },
          {
            id: exc2Id, workpaperId: wpIds["AC-PR-01"], controlId: ctlMap["AC-PR-01"], engagementId: engId,
            description: "Two vendor invoices (INV-2024-0887, INV-2024-1204) approved for payment with 7% price variance exceeding the 5% SAP tolerance threshold, with no override justification documented.",
            rootCause: "Two AP specialists were unaware that tolerance overrides require a written justification memo attached to the SAP document. The Q1 2024 policy update was not effectively communicated.",
            severity: "ControlDeficiency",
            managementResponse: "Policy training refresher conducted December 2024. Updated desk procedures distributed. SAP workflow updated to display reminder pop-up when tolerance override is triggered.",
            remediationPlan: "1. AP team retraining (Completed Dec 2024). 2. Updated desk procedures (Completed Dec 2024). 3. SAP pop-up reminder for overrides (Q1 2025).",
            remediationDueDate: new Date("2025-02-28"),
            status: "Open", raisedBy: adminId, raisedAt: new Date("2024-11-25"),
            createdAt: new Date(), updatedAt: new Date(),
          },
        ]);

        // ── Deficiency Assessment ────────────────────────────────────────
        await db.insert(deficiencyAssessments).values({
          id: randomUUID(), engagementId: engId,
          exceptionIds: [exc1Id, exc2Id],
          quantitativeThreshold: "Individual transactions do not exceed $250K materiality threshold. Aggregate exposure from 5 exceptions estimated at $1.2M.",
          qualitativeFactors: ["Management override risk — exceptions allow invoices to be processed without proper documentation", "Systemic nature — multiple AP specialists unaware of policy indicates training gap", "Design deficiency — SAP not configured to enforce mandatory approver field"],
          finalSeverity: "SignificantDeficiency",
          aiDraftAssessment: "Review of AC-PR-01 exceptions indicates an aggregate Significant Deficiency under PCAOB AS 2201. The systemic nature of the missing approver documentation (design deficiency) combined with the tolerance override exceptions indicates the control is not operating effectively across the population. Management has implemented remediation — SAP configuration update and retraining completed Q4 2024 — to be retested Q1 2025.",
          finalAssessment: "Aggregate assessment of AC-PR-01 exceptions results in Significant Deficiency per PCAOB AS 2201.69. Management remediation underway; retest planned prior to report issuance.",
          preparedBy: adminId, preparedAt: new Date("2024-12-10"),
          createdAt: new Date(), updatedAt: new Date(),
        });
      }

      // ── SOD Analysis ───────────────────────────────────────────────────
      await db.insert(sodAnalyses).values({
        id: randomUUID(), engagementId: engId,
        systemName: "SAP S/4HANA",
        conflicts: [
          { role1: "MM_PURCHASER", role2: "FI_AP_PROCESSOR", users: ["JSMITH", "RDAVIS"], risk: "User can create PO and process corresponding vendor invoice — bypasses procure-to-pay segregation", severity: "High", count: 2 },
          { role1: "FI_AP_PROCESSOR", role2: "PAYMENT_RUN_ADMIN", users: ["MCHEN"], risk: "User can approve vendor invoices and initiate payment runs — risk of unauthorized payments", severity: "High", count: 1 },
          { role1: "GL_JOURNAL_ENTRY", role2: "GL_PERIOD_CLOSE", users: ["KWONG", "ALEE", "BSMITH"], risk: "User can post journal entries and close periods — could conceal errors or fraud", severity: "Medium", count: 3 },
          { role1: "HR_PAYROLL_ADMIN", role2: "BANK_ACCOUNT_MAINT", users: ["FPATEL"], risk: "User can modify bank accounts and process payroll — risk of fraudulent diversion", severity: "High", count: 1 },
          { role1: "INVENTORY_ADJUST", role2: "INVENTORY_COUNT", users: ["TCHEN", "TNGUYEN"], risk: "User can adjust inventory quantities and approve cycle counts — risk of inventory manipulation", severity: "Medium", count: 2 },
        ],
        totalUsersAnalyzed: 342, totalConflictsFound: 9, highSeverityCount: 4,
        aiSummary: "Analysis of 342 active SAP users identified 9 SOD conflicts across 9 unique users. 4 high-severity conflicts exist in procure-to-pay and payroll processes. Management should implement compensating controls or remediate through role redesign for high-severity items.",
        analyzedAt: new Date("2024-11-30"), analyzedBy: adminId,
      });

      // ── Audit Trail ────────────────────────────────────────────────────
      const trailEvents = [
        { et: "engagement", a: "create",      d: "Engagement 'Acme Corp FY2024' created — team assembled, scope documented", ts: "2024-09-15" },
        { et: "control",    a: "create",      d: "20 in-scope controls defined: 12 ITGC (CM/AM/CO/PD) + 8 ITAC (Input/Processing/Output/Interface)", ts: "2024-09-20" },
        { et: "pbc",        a: "create",      d: "PBC request list issued to Acme Corp client portal — 6 items requested", ts: "2024-10-01" },
        { et: "pbc",        a: "update",      d: "PBC item 'SAP Active User Extract' received and accepted — IPE testing initiated", ts: "2024-10-12" },
        { et: "pbc",        a: "update",      d: "PBC item 'Change Management Log' received from ServiceNow and accepted", ts: "2024-10-14" },
        { et: "ipe",        a: "create",      d: "IPE completeness and accuracy testing completed for SAP Active User Extract — Pass", ts: "2024-10-18" },
        { et: "ipe",        a: "create",      d: "IPE completeness and accuracy testing completed for ServiceNow change log — Pass", ts: "2024-10-20" },
        { et: "workpaper",  a: "create",      d: "Workpaper CM-01 (Change Management Authorization) — 20 changes tested, no exceptions", ts: "2024-10-22" },
        { et: "pbc",        a: "update",      d: "PBC item 'AP Invoice Population' received from Finance and accepted — 4,217 invoices", ts: "2024-11-07" },
        { et: "ipe",        a: "create",      d: "IPE completeness and accuracy testing for AP invoice population — Pass", ts: "2024-11-08" },
        { et: "workpaper",  a: "create",      d: "Workpaper AM-01 (User Access Provisioning) — 25 accounts tested, 1 administrative exception (immaterial)", ts: "2024-11-15" },
        { et: "workpaper",  a: "generate_ai", d: "AI-assisted procedure drafting used for CO-01 and AC-PR-01 workpapers", ts: "2024-11-15" },
        { et: "workpaper",  a: "sign_off",    d: "Workpaper AM-01 reviewed and signed off by Engagement Manager", ts: "2024-11-18" },
        { et: "workpaper",  a: "create",      d: "Workpaper AC-IN-01 (AP Input Validation) completed — 40 items tested, no exceptions", ts: "2024-11-10" },
        { et: "workpaper",  a: "create",      d: "Workpaper CO-01 (Batch Job Operations) completed — 15 days tested, all within SLA", ts: "2024-11-01" },
        { et: "workpaper",  a: "create",      d: "Workpaper AC-PR-01 (Three-Way Match) — EXCEPTION NOTED, 8.3% rate exceeds 5% tolerable", ts: "2024-11-22" },
        { et: "exception",  a: "create",      d: "Exception raised: Missing approver documentation in SAP exception queue (3 invoices) — Significant Deficiency", ts: "2024-11-25" },
        { et: "exception",  a: "create",      d: "Exception raised: Tolerance override without written justification (2 invoices) — Control Deficiency", ts: "2024-11-25" },
        { et: "sod",        a: "create",      d: "SOD analysis completed for SAP S/4HANA — 342 users, 9 conflicts found, 4 high-severity", ts: "2024-11-30" },
        { et: "deficiency", a: "create",      d: "Deficiency assessment finalized — AC-PR-01 exceptions aggregated as Significant Deficiency per PCAOB AS 2201.69", ts: "2024-12-10" },
        { et: "engagement", a: "update",      d: "Engagement status updated to Under Review — pending partner sign-off", ts: "2024-12-15" },
      ];
      for (const ev of trailEvents) {
        await db.insert(auditTrail).values({
          id: randomUUID(), engagementId: engId,
          entityType: ev.et, entityId: engId, action: ev.a,
          description: ev.d, userId: adminId, timestamp: new Date(ev.ts),
        });
      }

      console.log("[Seed] Created workpapers, PBC, IPE, exceptions, deficiency assessment, SOD analysis, and audit trail for Acme Corp FY2024");
    }
  } catch (e) {
    console.warn("[Seed] Could not seed workpapers/exceptions/SOD data:", e);
  }

  // ── Seed PBC items for Acme Corp independently (runs even if workpapers already existed) ──
  try {
    const [acmeEngForPbc] = await db.select({ id: engagements.id }).from(engagements)
      .where(eq(engagements.clientName, "Acme Corp")).limit(1);
    if (acmeEngForPbc) {
      const existingPbc = await db.select({ id: pbcItems.id }).from(pbcItems)
        .where(eq(pbcItems.engagementId, acmeEngForPbc.id)).limit(1);
      if (existingPbc.length === 0) {
        const ctlRowsPbc = await db.select({ id: controls.id, controlRef: controls.controlRef })
          .from(controls).where(eq(controls.engagementId, acmeEngForPbc.id));
        const cm: Record<string, string> = {};
        for (const c of ctlRowsPbc) cm[c.controlRef] = c.id;
        const engId = acmeEngForPbc.id;
        const today = new Date();
        const due1 = new Date("2024-10-15");
        const due2 = new Date("2024-10-22");
        const due3 = new Date("2024-11-01");
        await db.insert(pbcItems).values([
          { id: randomUUID(), engagementId: engId, controlId: cm["AM-01"] ?? null,
            description: "Active SAP user list as of 12/31/2024 (SUIM export: username, role, last login, department)",
            requestedDate: today, dueDate: due1, receivedDate: new Date("2024-10-12"),
            status: "Accepted" as const, fileName: "SAP_Active_Users_20241231.xlsx", isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AM-01"] ?? null,
            description: "User provisioning log for FY2024 — all new access granted with approval documentation",
            requestedDate: today, dueDate: due1, receivedDate: new Date("2024-10-14"),
            status: "Received" as const, isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AM-04"] ?? null,
            description: "Terminated employee list from HR for FY2024 with termination dates",
            requestedDate: today, dueDate: due1, status: "Requested" as const, isIpe: false, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["CM-01"] ?? null,
            description: "Complete change ticket log from ServiceNow for FY2024 (all change requests, approvals, implementations)",
            requestedDate: today, dueDate: due2, receivedDate: new Date("2024-10-20"),
            status: "Accepted" as const, fileName: "ServiceNow_Changes_FY2024.xlsx", isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["CM-01"] ?? null,
            description: "25 sample change tickets with approval emails and UAT sign-off documentation",
            requestedDate: today, dueDate: due2, status: "Requested" as const, isIpe: false, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["CM-03"] ?? null,
            description: "Emergency change log for FY2024 with post-implementation approval documentation",
            requestedDate: today, dueDate: due2, receivedDate: new Date("2024-10-19"),
            status: "Accepted" as const, isIpe: false, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["CO-01"] ?? null,
            description: "AWS CloudWatch batch job completion logs for FY2024 (daily runs with success/failure status)",
            requestedDate: today, dueDate: due3, receivedDate: new Date("2024-10-28"),
            status: "Accepted" as const, fileName: "CloudWatch_BatchJobs_FY2024.csv", isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["CO-01"] ?? null,
            description: "Backup restore test documentation — most recent test with results and sign-off",
            requestedDate: today, dueDate: due3, status: "Requested" as const, isIpe: false, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AC-PR-01"] ?? null,
            description: "Population of 4,217 AP invoices processed in SAP FY2024 (invoice number, vendor, amount, date, match result)",
            requestedDate: today, dueDate: due3, receivedDate: new Date("2024-11-01"),
            status: "Accepted" as const, fileName: "SAP_AP_Invoices_FY2024.xlsx", isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AC-IN-01"] ?? null,
            description: "SAP input validation configuration screenshots showing edit checks and mandatory field rules",
            requestedDate: today, dueDate: due3, receivedDate: new Date("2024-10-30"),
            status: "Accepted" as const, isIpe: false, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AC-IN-01"] ?? null,
            description: "Error / rejected transaction log for FY2024 showing SAP validation failures and resolutions",
            requestedDate: today, dueDate: due3, status: "Requested" as const, isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AC-IF-01"] ?? null,
            description: "Interface monitoring log for FY2024 (record counts, timestamps, success/failure per run)",
            requestedDate: today, dueDate: due2, receivedDate: new Date("2024-10-25"),
            status: "Rejected" as const, rejectionReason: "Incomplete — missing Q4 data. Please re-export to include full fiscal year.", isIpe: true, createdAt: today },
          { id: randomUUID(), engagementId: engId, controlId: cm["AC-IF-01"] ?? null,
            description: "Reconciliation of records transmitted vs. received by destination system (counts and amounts)",
            requestedDate: today, dueDate: due3, status: "Requested" as const, isIpe: true, createdAt: today },
        ]);
        console.log("[Seed] Created 13 PBC items for Acme Corp FY2024");
      }
    }
  } catch (e) {
    console.warn("[Seed] Could not seed Acme Corp PBC items:", e);
  }
})();

// ── Health check ────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error" });
  }
});

// ── Public portal API (no auth — token-gated) ───────────────────────────────

// GET /api/portal/:token — validate token, return engagement + PBC items + controls (simplified)
app.get("/api/portal/:token", async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found or revoked" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link has expired" });

    const items = await db.select().from(pbcItems).where(eq(pbcItems.engagementId, pt.engagementId));

    // Return simplified control view — no workpaper content exposed to client
    const ctls = await db.select({
      id: controls.id,
      controlRef: controls.controlRef,
      objective: controls.objective,
      domain: controls.domain,
      itgcType: controls.itgcType,
      itacType: controls.itacType,
      riskLevel: controls.riskLevel,
      status: controls.status,
    }).from(controls).where(eq(controls.engagementId, pt.engagementId));

    res.json({
      portalToken: pt,
      pbcItems: items,
      controls: ctls,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/portal/:token/suggest — client submits a control suggestion
app.post("/api/portal/:token/suggest", async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link expired" });

    const { processName, systemName, description, contactName } = req.body as {
      processName: string; systemName?: string; description: string; contactName?: string;
    };
    if (!processName || !description) return res.status(400).json({ error: "processName and description are required" });

    await db.insert(portalSuggestions).values({
      id: randomUUID(),
      engagementId: pt.engagementId,
      portalTokenId: pt.id,
      clientName: pt.clientName,
      processName,
      systemName: systemName ?? null,
      description,
      contactName: contactName ?? null,
      status: "pending",
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[Portal suggest]", err);
    res.status(500).json({ error: "Failed to submit suggestion" });
  }
});

// POST /api/portal/:token/upload/:pbcItemId — client file upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post("/api/portal/:token/upload/:pbcItemId", upload.single("file"), async (req, res) => {
  try {
    const [pt] = await db.select().from(portalTokens).where(
      and(eq(portalTokens.token, req.params.token), eq(portalTokens.isActive, true))
    );
    if (!pt) return res.status(404).json({ error: "Portal link not found" });
    if (new Date(pt.expiresAt) < new Date()) return res.status(410).json({ error: "Portal link expired" });

    const [item] = await db.select().from(pbcItems).where(
      and(eq(pbcItems.id, req.params.pbcItemId), eq(pbcItems.engagementId, pt.engagementId))
    );
    if (!item) return res.status(404).json({ error: "PBC item not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const mimeType = getMimeType(file.originalname);
    const s3Key = `pbc/${pt.engagementId}/${req.params.pbcItemId}/${randomUUID()}-${file.originalname}`;

    const { url, hash } = await uploadToS3({ key: s3Key, buffer: file.buffer, contentType: mimeType });

    // Parse file content for AI classification
    const parsed = await parseFileBuffer(file.buffer, file.originalname);
    let aiClassification: string | null = null;
    try {
      const cls = await classifyPbcFileAI({
        fileName: file.originalname,
        buffer: file.buffer,
        mimeType: parsed.mimeType,
        isImage: parsed.isImage,
        isPdf: parsed.isPdf,
        textContent: parsed.text,
      });
      aiClassification = JSON.stringify(cls);
    } catch {
      // Classification failure is non-fatal
    }

    await db.update(pbcItems).set({
      fileUrl: url,
      fileName: file.originalname,
      fileHash: hash,
      fileSizeBytes: file.size,
      status: "Received",
      receivedDate: new Date(),
      uploadedAt: new Date(),
      fileContent: parsed.text.slice(0, 8000),
      aiClassification,
    }).where(eq(pbcItems.id, req.params.pbcItemId));

    res.json({ success: true, fileName: file.originalname, fileUrl: url, aiClassification });
  } catch (err) {
    console.error("[Portal upload]", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── SSO routes ───────────────────────────────────────────────────────────────
app.use("/api/auth/sso", buildSSORouter());

// ── Google Drive OAuth ────────────────────────────────────────────────────────
// Step 1: Redirect user to Google consent screen
app.get("/api/cloud/google-drive/connect", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Google OAuth not configured" });
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/google-drive/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.readonly email profile");
  const state = encodeURIComponent((req.query.userId as string) ?? "");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  res.redirect(url);
});

// Step 2: Exchange code for tokens, store connection
app.get("/api/cloud/google-drive/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    const userId = decodeURIComponent(state ?? "");
    if (!userId || !code) return res.status(400).send("Missing code or user context");

    const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/google-drive/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };

    // Get user info
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as { email: string; name: string };

    // Upsert connection (one per user per provider)
    const existing = await db.select().from(cloudConnections).where(
      and(eq(cloudConnections.userId, userId), eq(cloudConnections.provider, "google_drive"))
    );

    if (existing.length > 0) {
      await db.update(cloudConnections).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing[0].refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email: profile.email,
        displayName: profile.name,
        isActive: true,
      }).where(eq(cloudConnections.id, existing[0].id));
    } else {
      await db.insert(cloudConnections).values({
        id: randomUUID(),
        userId,
        provider: "google_drive",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email: profile.email,
        displayName: profile.name,
        isActive: true,
        createdAt: new Date(),
      });
    }

    // Redirect back to the app settings page
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=connected&provider=google_drive`);
  } catch (err) {
    console.error("[Google Drive OAuth]", err);
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=error`);
  }
});

// ── OneDrive OAuth ────────────────────────────────────────────────────────────
app.get("/api/cloud/onedrive/connect", (req, res) => {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "OneDrive OAuth not configured" });
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/onedrive/callback`;
  const scope = encodeURIComponent("Files.Read.All User.Read offline_access");
  const state = encodeURIComponent((req.query.userId as string) ?? "");
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
  res.redirect(url);
});

app.get("/api/cloud/onedrive/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    const userId = decodeURIComponent(state ?? "");
    if (!userId || !code) return res.status(400).send("Missing code or user context");

    const redirectUri = `${process.env.APP_URL ?? "http://localhost:3001"}/api/cloud/onedrive/callback`;
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.ONEDRIVE_CLIENT_ID ?? "",
        client_secret: process.env.ONEDRIVE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) throw new Error(`OneDrive token exchange failed: ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number };

    // Get user profile via Graph
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as { displayName: string; mail?: string; userPrincipalName?: string };
    const email = profile.mail ?? profile.userPrincipalName ?? "";

    const existing = await db.select().from(cloudConnections).where(
      and(eq(cloudConnections.userId, userId), eq(cloudConnections.provider, "onedrive"))
    );

    if (existing.length > 0) {
      await db.update(cloudConnections).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing[0].refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email,
        displayName: profile.displayName,
        isActive: true,
      }).where(eq(cloudConnections.id, existing[0].id));
    } else {
      await db.insert(cloudConnections).values({
        id: randomUUID(),
        userId,
        provider: "onedrive",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        email,
        displayName: profile.displayName,
        isActive: true,
        createdAt: new Date(),
      });
    }

    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=connected&provider=onedrive`);
  } catch (err) {
    console.error("[OneDrive OAuth]", err);
    res.redirect(`${process.env.CLIENT_URL ?? "http://localhost:5173"}/settings?cloud=error`);
  }
});

// ── tRPC (with rate limiters on sensitive paths) ─────────────────────────────
// Auth procedures get the strict limiter
app.use("/api/trpc/auth.login", authLimiter);
app.use("/api/trpc/auth.register", authLimiter);
app.use("/api/trpc/auth.verifyMfa", authLimiter);
// File operations get the upload limiter
app.use("/api/upload", uploadLimiter);
// All other API traffic gets the general limiter
app.use("/api/trpc", apiLimiter, createExpressMiddleware({ router: appRouter, createContext }));

// ── Serve built SPA in production ────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const distPath = join(process.cwd(), "dist/public");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(join(distPath, "index.html")));
  }
}

app.listen(PORT, () => {
  console.log(`[Auditly] Server running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;

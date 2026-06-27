import { pgTable, text, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["preparer", "senior", "manager", "partner", "admin"]);
export const engagementStatusEnum = pgEnum("engagement_status", ["planning", "fieldwork", "review", "complete", "archived"]);
export const controlDomainEnum = pgEnum("control_domain", ["ITGC", "ITAC"]);
export const itgcTypeEnum = pgEnum("itgc_type", ["CM", "AM", "CO", "PD"]);
export const itacTypeEnum = pgEnum("itac_type", ["Input", "Processing", "Output", "Interface"]);
export const frequencyEnum = pgEnum("frequency", ["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"]);
export const riskLevelEnum = pgEnum("risk_level", ["High", "Medium", "Low"]);
export const controlStatusEnum = pgEnum("control_status", ["NotStarted", "InProgress", "UnderReview", "Complete", "Exception"]);
export const pbcStatusEnum = pgEnum("pbc_status", ["Requested", "Received", "Accepted", "Rejected", "NotRequired"]);
export const conclusionEnum = pgEnum("conclusion", ["Pass", "ExceptionNoted", "InProgress"]);
export const exceptionSeverityEnum = pgEnum("exception_severity", ["ControlDeficiency", "SignificantDeficiency", "MaterialWeakness"]);
export const exceptionStatusEnum = pgEnum("exception_status", ["Open", "Remediated", "AcceptedRisk", "PendingRetest"]);
export const ipeStatusEnum = pgEnum("ipe_status", ["NotTested", "Pass", "Fail"]);
export const systemTypeEnum = pgEnum("system_type", ["ERP", "OS", "Database", "Cloud", "Application", "Network", "Other"]);

// ── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("preparer"),
  firmName: text("firm_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// ── Engagements ────────────────────────────────────────────────────────────

export const engagements = pgTable("engagements", {
  id: text("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientIndustry: text("client_industry"),
  fiscalYear: integer("fiscal_year").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: engagementStatusEnum("status").notNull().default("planning"),
  framework: text("framework").notNull().default("PCAOB"), // PCAOB, AICPA, ISAE3402
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const engagementMembers = pgTable("engagement_members", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: userRoleEnum("role").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
});

// ── In-scope systems ───────────────────────────────────────────────────────

export const systems = pgTable("systems", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  name: text("name").notNull(),
  type: systemTypeEnum("type").notNull(),
  vendor: text("vendor"),
  version: text("version"),
  description: text("description"),
  inScope: boolean("in_scope").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Controls ───────────────────────────────────────────────────────────────

export const controls = pgTable("controls", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  systemId: text("system_id").references(() => systems.id),
  domain: controlDomainEnum("domain").notNull(),
  itgcType: itgcTypeEnum("itgc_type"),   // null for ITAC
  itacType: itacTypeEnum("itac_type"),   // null for ITGC
  controlRef: text("control_ref").notNull(), // e.g. CM-01, AM-03, ITAC-01
  objective: text("objective").notNull(),
  description: text("description"),
  frequency: frequencyEnum("frequency").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull().default("Medium"),
  status: controlStatusEnum("status").notNull().default("NotStarted"),
  assignedTo: text("assigned_to").references(() => users.id),
  priorYearResult: conclusionEnum("prior_year_result"),
  priorYearException: text("prior_year_exception"),
  elevatedSample: boolean("elevated_sample").notNull().default(false), // true if prior year exception
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── PBC Items ──────────────────────────────────────────────────────────────

export const pbcItems = pgTable("pbc_items", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  controlId: text("control_id").references(() => controls.id),
  description: text("description").notNull(),
  requestedDate: timestamp("requested_date"),
  dueDate: timestamp("due_date"),
  receivedDate: timestamp("received_date"),
  status: pbcStatusEnum("status").notNull().default("Requested"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileHash: text("file_hash"), // SHA-256 for integrity
  fileSizeBytes: integer("file_size_bytes"),
  uploadedBy: text("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at"),
  isIpe: boolean("is_ipe").notNull().default(false), // also serves as IPE
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── IPE Register ───────────────────────────────────────────────────────────

export const ipeItems = pgTable("ipe_items", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  pbcItemId: text("pbc_item_id").references(() => pbcItems.id),
  reportName: text("report_name").notNull(),
  system: text("system").notNull(),
  parameters: text("parameters"), // what parameters were used to run the report
  runDate: timestamp("run_date"),
  runBy: text("run_by"), // client contact who ran the report
  completenessStatus: ipeStatusEnum("completeness_status").notNull().default("NotTested"),
  completenessNotes: text("completeness_notes"),
  completenessAiDraft: text("completeness_ai_draft"),
  accuracyStatus: ipeStatusEnum("accuracy_status").notNull().default("NotTested"),
  accuracyNotes: text("accuracy_notes"),
  accuracyAiDraft: text("accuracy_ai_draft"),
  linkedControls: text("linked_controls").array(), // controlIds that rely on this IPE
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Workpapers ─────────────────────────────────────────────────────────────

export const workpapers = pgTable("workpapers", {
  id: text("id").primaryKey(),
  controlId: text("control_id").notNull().references(() => controls.id),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  // Population
  populationDescription: text("population_description"),
  populationCount: integer("population_count"),
  populationPeriod: text("population_period"),
  // Sample
  sampleSize: integer("sample_size"),
  samplingMethod: text("sampling_method"), // Random, Haphazard, Systematic
  sampleItems: jsonb("sample_items"), // array of sampled items with evidence
  // AI-generated content (editable)
  procedureDraft: text("procedure_draft"),
  procedureFinal: text("procedure_final"),
  resultsDraft: text("results_draft"),
  resultsFinal: text("results_final"),
  conclusionDraft: text("conclusion_draft"),
  conclusionFinal: text("conclusion_final"),
  // Conclusion
  conclusion: conclusionEnum("conclusion").notNull().default("InProgress"),
  // Sign-offs
  preparedBy: text("prepared_by").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  // Metadata
  aiGeneratedAt: timestamp("ai_generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Exceptions ─────────────────────────────────────────────────────────────

export const exceptions = pgTable("exceptions", {
  id: text("id").primaryKey(),
  workpaperId: text("workpaper_id").notNull().references(() => workpapers.id),
  controlId: text("control_id").notNull().references(() => controls.id),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  description: text("description").notNull(),
  rootCause: text("root_cause"),
  severity: exceptionSeverityEnum("severity").notNull().default("ControlDeficiency"),
  managementResponse: text("management_response"),
  remediationPlan: text("remediation_plan"),
  remediationDueDate: timestamp("remediation_due_date"),
  status: exceptionStatusEnum("status").notNull().default("Open"),
  retestDate: timestamp("retest_date"),
  retestResult: conclusionEnum("retest_result"),
  aiDraftMemo: text("ai_draft_memo"),
  managementLetterComment: text("management_letter_comment"),
  raisedBy: text("raised_by").references(() => users.id),
  raisedAt: timestamp("raised_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Deficiency Assessments ─────────────────────────────────────────────────

export const deficiencyAssessments = pgTable("deficiency_assessments", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  exceptionIds: text("exception_ids").array().notNull(), // can aggregate multiple
  quantitativeThreshold: text("quantitative_threshold"), // e.g. "5% of pre-tax income = $2.3M"
  qualitativeFactors: jsonb("qualitative_factors"), // pervasiveness, management override, etc.
  finalSeverity: exceptionSeverityEnum("final_severity").notNull(),
  aiDraftAssessment: text("ai_draft_assessment"),
  finalAssessment: text("final_assessment"),
  preparedBy: text("prepared_by").references(() => users.id),
  preparedAt: timestamp("prepared_at"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── SOD Analysis ───────────────────────────────────────────────────────────

export const sodAnalyses = pgTable("sod_analyses", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  systemName: text("system_name").notNull(),
  pbcItemId: text("pbc_item_id").references(() => pbcItems.id),
  conflicts: jsonb("conflicts").notNull(), // array of {userId, userName, conflictingRoles, businessRisk, severity}
  totalUsersAnalyzed: integer("total_users_analyzed"),
  totalConflictsFound: integer("total_conflicts_found"),
  highSeverityCount: integer("high_severity_count"),
  aiSummary: text("ai_summary"),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
  analyzedBy: text("analyzed_by").references(() => users.id),
});

// ── Audit Trail ────────────────────────────────────────────────────────────

export const auditTrail = pgTable("audit_trail", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").references(() => engagements.id),
  entityType: text("entity_type").notNull(), // "workpaper" | "exception" | "pbc" | "control" | etc.
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // "created" | "updated" | "signed_off" | "ai_generated" | "exported" | etc.
  before: jsonb("before"),
  after: jsonb("after"),
  description: text("description"),
  userId: text("user_id").references(() => users.id),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// ── Export Log ─────────────────────────────────────────────────────────────

export const exportLog = pgTable("export_log", {
  id: text("id").primaryKey(),
  engagementId: text("engagement_id").notNull().references(() => engagements.id),
  exportType: text("export_type").notNull(), // "full_workbook" | "single_control" | "exception_log" | "pbc_tracker"
  controlIds: text("control_ids").array(),
  fileUrl: text("file_url"),
  exportedBy: text("exported_by").references(() => users.id),
  exportedAt: timestamp("exported_at").defaultNow().notNull(),
});

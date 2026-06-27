import { mysqlTable, varchar, text, int, boolean, json, datetime, mysqlEnum } from "drizzle-orm/mysql-core";

// ── Users ──────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: mysqlEnum("role", ["preparer", "senior", "manager", "partner", "admin"]).notNull().default("preparer"),
  firmName: text("firm_name"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  lastLoginAt: datetime("last_login_at"),
  ssoProvider: text("sso_provider"),
  ssoId: text("sso_id"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaBackupCodes: text("mfa_backup_codes"),
  failedLoginAttempts: int("failed_login_attempts").notNull().default(0),
  lockedUntil: datetime("locked_until"),
  passwordChangedAt: datetime("password_changed_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastActivityAt: datetime("last_activity_at"),
});

// ── Engagements ────────────────────────────────────────────────────────────

export const engagements = mysqlTable("engagements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  clientName: text("client_name").notNull(),
  clientIndustry: text("client_industry"),
  fiscalYear: int("fiscal_year").notNull(),
  periodStart: datetime("period_start").notNull(),
  periodEnd: datetime("period_end").notNull(),
  status: mysqlEnum("status", ["planning", "fieldwork", "review", "complete", "archived"]).notNull().default("planning"),
  framework: varchar("framework", { length: 50 }).notNull().default("PCAOB"),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

export const engagementMembers = mysqlTable("engagement_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  role: mysqlEnum("role", ["preparer", "senior", "manager", "partner", "admin"]).notNull(),
  assignedAt: datetime("assigned_at").notNull().$defaultFn(() => new Date()),
});

// ── In-scope systems ───────────────────────────────────────────────────────

export const systems = mysqlTable("systems", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  name: text("name").notNull(),
  type: mysqlEnum("type", ["ERP", "OS", "Database", "Cloud", "Application", "Network", "Other"]).notNull(),
  vendor: text("vendor"),
  version: text("version"),
  description: text("description"),
  inScope: boolean("in_scope").notNull().default(true),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── Controls ───────────────────────────────────────────────────────────────

export const controls = mysqlTable("controls", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  systemId: varchar("system_id", { length: 36 }).references(() => systems.id),
  domain: mysqlEnum("domain", ["ITGC", "ITAC"]).notNull(),
  itgcType: mysqlEnum("itgc_type", ["CM", "AM", "CO", "PD"]),
  itacType: mysqlEnum("itac_type", ["Input", "Processing", "Output", "Interface"]),
  controlRef: text("control_ref").notNull(),
  objective: text("objective").notNull(),
  description: text("description"),
  frequency: mysqlEnum("frequency", ["Annual", "SemiAnnual", "Quarterly", "Monthly", "Daily", "Continuous"]).notNull(),
  riskLevel: mysqlEnum("risk_level", ["High", "Medium", "Low"]).notNull().default("Medium"),
  status: mysqlEnum("status", ["NotStarted", "InProgress", "UnderReview", "Complete", "Exception"]).notNull().default("NotStarted"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id),
  priorYearResult: mysqlEnum("prior_year_result", ["Pass", "ExceptionNoted", "InProgress"]),
  priorYearException: text("prior_year_exception"),
  elevatedSample: boolean("elevated_sample").notNull().default(false),
  procedureTemplate: text("procedure_template"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── PBC Items ──────────────────────────────────────────────────────────────

export const pbcItems = mysqlTable("pbc_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  controlId: varchar("control_id", { length: 36 }).references(() => controls.id),
  description: text("description").notNull(),
  requestedDate: datetime("requested_date"),
  dueDate: datetime("due_date"),
  receivedDate: datetime("received_date"),
  status: mysqlEnum("status", ["Requested", "Received", "Accepted", "Rejected", "NotRequired"]).notNull().default("Requested"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileHash: text("file_hash"),
  fileSizeBytes: int("file_size_bytes"),
  uploadedBy: varchar("uploaded_by", { length: 36 }).references(() => users.id),
  uploadedAt: datetime("uploaded_at"),
  isIpe: boolean("is_ipe").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  fileContent: text("file_content"),
  aiClassification: text("ai_classification"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── IPE Register ───────────────────────────────────────────────────────────

export const ipeItems = mysqlTable("ipe_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  pbcItemId: varchar("pbc_item_id", { length: 36 }).references(() => pbcItems.id),
  reportName: text("report_name").notNull(),
  system: text("system").notNull(),
  parameters: text("parameters"),
  runDate: datetime("run_date"),
  runBy: text("run_by"),
  completenessStatus: mysqlEnum("completeness_status", ["NotTested", "Pass", "Fail"]).notNull().default("NotTested"),
  completenessNotes: text("completeness_notes"),
  completenessAiDraft: text("completeness_ai_draft"),
  accuracyStatus: mysqlEnum("accuracy_status", ["NotTested", "Pass", "Fail"]).notNull().default("NotTested"),
  accuracyNotes: text("accuracy_notes"),
  accuracyAiDraft: text("accuracy_ai_draft"),
  linkedControls: json("linked_controls").$type<string[]>(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── Workpapers ─────────────────────────────────────────────────────────────

export const workpapers = mysqlTable("workpapers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  controlId: varchar("control_id", { length: 36 }).notNull().references(() => controls.id),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  populationDescription: text("population_description"),
  populationCount: int("population_count"),
  populationPeriod: text("population_period"),
  sampleSize: int("sample_size"),
  samplingMethod: text("sampling_method"),
  sampleItems: json("sample_items"),
  procedureTemplate: text("procedure_template"),
  resultsTemplate: text("results_template"),
  conclusionTemplate: text("conclusion_template"),
  templateId: varchar("template_id", { length: 36 }),
  procedureDraft: text("procedure_draft"),
  procedureFinal: text("procedure_final"),
  resultsDraft: text("results_draft"),
  resultsFinal: text("results_final"),
  conclusionDraft: text("conclusion_draft"),
  conclusionFinal: text("conclusion_final"),
  conclusion: mysqlEnum("conclusion", ["Pass", "ExceptionNoted", "InProgress"]).notNull().default("InProgress"),
  preparedBy: varchar("prepared_by", { length: 36 }).references(() => users.id),
  preparedAt: datetime("prepared_at"),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  reviewedAt: datetime("reviewed_at"),
  reviewNotes: text("review_notes"),
  approvedBy: varchar("approved_by", { length: 36 }).references(() => users.id),
  approvedAt: datetime("approved_at"),
  aiGeneratedAt: datetime("ai_generated_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── Exceptions ─────────────────────────────────────────────────────────────

export const exceptions = mysqlTable("exceptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workpaperId: varchar("workpaper_id", { length: 36 }).notNull().references(() => workpapers.id),
  controlId: varchar("control_id", { length: 36 }).notNull().references(() => controls.id),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  description: text("description").notNull(),
  rootCause: text("root_cause"),
  severity: mysqlEnum("severity", ["ControlDeficiency", "SignificantDeficiency", "MaterialWeakness"]).notNull().default("ControlDeficiency"),
  managementResponse: text("management_response"),
  remediationPlan: text("remediation_plan"),
  remediationDueDate: datetime("remediation_due_date"),
  status: mysqlEnum("status", ["Open", "Remediated", "AcceptedRisk", "PendingRetest"]).notNull().default("Open"),
  retestDate: datetime("retest_date"),
  retestResult: mysqlEnum("retest_result", ["Pass", "ExceptionNoted", "InProgress"]),
  aiDraftMemo: text("ai_draft_memo"),
  managementLetterComment: text("management_letter_comment"),
  raisedBy: varchar("raised_by", { length: 36 }).references(() => users.id),
  raisedAt: datetime("raised_at").notNull().$defaultFn(() => new Date()),
  closedAt: datetime("closed_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── Deficiency Assessments ─────────────────────────────────────────────────

export const deficiencyAssessments = mysqlTable("deficiency_assessments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  exceptionIds: json("exception_ids").$type<string[]>().notNull(),
  quantitativeThreshold: text("quantitative_threshold"),
  qualitativeFactors: json("qualitative_factors"),
  finalSeverity: mysqlEnum("final_severity", ["ControlDeficiency", "SignificantDeficiency", "MaterialWeakness"]).notNull(),
  aiDraftAssessment: text("ai_draft_assessment"),
  finalAssessment: text("final_assessment"),
  preparedBy: varchar("prepared_by", { length: 36 }).references(() => users.id),
  preparedAt: datetime("prepared_at"),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── SOD Analysis ───────────────────────────────────────────────────────────

export const sodAnalyses = mysqlTable("sod_analyses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  systemName: text("system_name").notNull(),
  pbcItemId: varchar("pbc_item_id", { length: 36 }).references(() => pbcItems.id),
  conflicts: json("conflicts").notNull(),
  totalUsersAnalyzed: int("total_users_analyzed"),
  totalConflictsFound: int("total_conflicts_found"),
  highSeverityCount: int("high_severity_count"),
  aiSummary: text("ai_summary"),
  analyzedAt: datetime("analyzed_at").notNull().$defaultFn(() => new Date()),
  analyzedBy: varchar("analyzed_by", { length: 36 }).references(() => users.id),
});

// ── Audit Trail ────────────────────────────────────────────────────────────

export const auditTrail = mysqlTable("audit_trail", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).references(() => engagements.id),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  action: text("action").notNull(),
  before: json("before"),
  after: json("after"),
  description: text("description"),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: datetime("timestamp").notNull().$defaultFn(() => new Date()),
});

// ── Client Portal Tokens ───────────────────────────────────────────────────

export const portalTokens = mysqlTable("portal_tokens", {
  id: varchar("id", { length: 36 }).primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id),
  expiresAt: datetime("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── Portal Control Suggestions ─────────────────────────────────────────────

export const portalSuggestions = mysqlTable("portal_suggestions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  portalTokenId: varchar("portal_token_id", { length: 36 }).notNull().references(() => portalTokens.id),
  clientName: text("client_name").notNull(),
  processName: text("process_name").notNull(),
  systemName: text("system_name"),
  description: text("description").notNull(),
  contactName: text("contact_name"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  auditorNotes: text("auditor_notes"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  reviewedAt: datetime("reviewed_at"),
});

// ── Export Log ─────────────────────────────────────────────────────────────

export const exportLog = mysqlTable("export_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  exportType: text("export_type").notNull(),
  controlIds: json("control_ids").$type<string[]>(),
  fileUrl: text("file_url"),
  exportedBy: varchar("exported_by", { length: 36 }).references(() => users.id),
  exportedAt: datetime("exported_at").notNull().$defaultFn(() => new Date()),
});

// ── Workpaper Templates ─────────────────────────────────────────────────────

export const workpaperTemplates = mysqlTable("workpaper_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).references(() => engagements.id),
  name: text("name").notNull(),
  controlType: text("control_type"),
  riskLevel: text("risk_level"),
  framework: varchar("framework", { length: 50 }).default("PCAOB"),
  procedureTemplate: text("procedure_template"),
  resultsTemplate: text("results_template"),
  conclusionTemplate: text("conclusion_template"),
  useCount: int("use_count").notNull().default(0),
  tags: text("tags"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// ── API Connections ─────────────────────────────────────────────────────────

export const apiConnections = mysqlTable("api_connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  engagementId: varchar("engagement_id", { length: 36 }).notNull().references(() => engagements.id),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  credentials: text("credentials"),
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: datetime("last_tested_at"),
  lastTestResult: text("last_test_result"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── Control → API Mapping ───────────────────────────────────────────────────

export const controlApiMappings = mysqlTable("control_api_mappings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  controlId: varchar("control_id", { length: 36 }).notNull().references(() => controls.id),
  apiConnectionId: varchar("api_connection_id", { length: 36 }).notNull().references(() => apiConnections.id),
  queryConfig: text("query_config"),
  lastPulledAt: datetime("last_pulled_at"),
  lastPullStatus: text("last_pull_status"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── Cloud Storage Connections ───────────────────────────────────────────────

export const cloudConnections = mysqlTable("cloud_connections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  provider: text("provider").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: datetime("token_expires_at"),
  email: text("email"),
  displayName: text("display_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── Control → Cloud Folder Link ─────────────────────────────────────────────

export const controlFolderLinks = mysqlTable("control_folder_links", {
  id: varchar("id", { length: 36 }).primaryKey(),
  controlId: varchar("control_id", { length: 36 }).notNull().references(() => controls.id),
  cloudConnectionId: varchar("cloud_connection_id", { length: 36 }).notNull().references(() => cloudConnections.id),
  folderId: text("folder_id").notNull(),
  folderName: text("folder_name"),
  folderPath: text("folder_path"),
  lastSyncedAt: datetime("last_synced_at"),
  lastSyncStatus: text("last_sync_status"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

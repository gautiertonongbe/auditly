import ExcelJS from "exceljs";
import { format } from "date-fns";
import type { TestDetailResult } from "./ai";

const COLORS = {
  navyHeader:   "1E3A5F",
  navyLight:    "2A4F7C",
  lightBlue:    "EBF3FB",
  midBlue:      "D6E4F0",
  gold:         "D4AF37",
  goldLight:    "FDF6E3",
  green:        "27AE60",
  greenLight:   "EAFAF1",
  red:          "E74C3C",
  redLight:     "FDEDEC",
  orange:       "F39C12",
  orangeLight:  "FEF9E7",
  grey:         "7F8C8D",
  greyLight:    "F5F6FA",
  white:        "FFFFFF",
  reviewBg:     "F8F0FF",   // soft lavender for reviewer notes
  directorBg:   "FFF8F0",   // soft amber for director sign-off
};

// ── Shared style helpers ─────────────────────────────────────────────────────

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.BorderStyle = "thin";
  return { top: { style: side }, left: { style: side }, bottom: { style: side }, right: { style: side } };
}

function cellFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function mergeRange(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  ws.mergeCells(r1, c1, r2, c2);
}

// Standard Big 4 print setup applied to every sheet
function applyPrintSetup(ws: ExcelJS.Worksheet, opts: {
  clientName: string;
  freezeRow?: number;   // row to freeze below (e.g. 4 = freeze rows 1-4)
  freezeCol?: number;   // col to freeze right of
  filterRow?: number;   // row to place autofilter
  landscape?: boolean;
  tabColor?: string;
}) {
  // Freeze panes
  if (opts.freezeRow || opts.freezeCol) {
    ws.views = [{
      state: "frozen",
      ySplit: opts.freezeRow ?? 0,
      xSplit: opts.freezeCol ?? 0,
      topLeftCell: opts.freezeRow || opts.freezeCol
        ? `${opts.freezeCol ? String.fromCharCode(65 + (opts.freezeCol)) : "A"}${(opts.freezeRow ?? 0) + 1}`
        : "A1",
      activeCell: "A1",
    }];
  }

  // Print page setup
  ws.pageSetup = {
    orientation: opts.landscape !== false ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    paperSize: 9, // A4
    printTitlesRow: opts.freezeRow ? `1:${opts.freezeRow}` : undefined,
  };

  // Print header/footer
  ws.headerFooter = {
    oddHeader: `&L&"Arial,Bold"&9${opts.clientName}  —  CONFIDENTIAL&C&"Arial,Bold"&9AUDITLY AUDIT WORKPAPER&R&"Arial,Regular"&9${ws.name}`,
    oddFooter: `&L&"Arial,Regular"&8FOR AUDIT USE ONLY  |  Prepared with Auditly&C&"Arial,Regular"&8Page &P of &N&R&"Arial,Regular"&8&D`,
  };

  // Autofilter
  if (opts.filterRow) {
    const lastCol = ws.columnCount || 12;
    const endCol = String.fromCharCode(64 + lastCol);
    ws.autoFilter = `A${opts.filterRow}:${endCol}${opts.filterRow}`;
  }

  // Tab color
  if (opts.tabColor) {
    ws.properties = { ...ws.properties, tabColor: { argb: opts.tabColor } };
  }
}

// Big 4 professional header block (rows 1-6)
function applyWorkpaperHeader(ws: ExcelJS.Worksheet, opts: {
  clientName: string;
  engagementName: string;
  period: string;
  controlRef: string;
  controlType: string;
  riskLevel: string;
  frequency: string;
  preparedBy: string;
  preparedDate: string;
  reviewedBy: string;
  reviewedDate: string;
  approvedBy?: string;
  approvedDate?: string;
  pageTitle: string;
  numCols: number;
}) {
  const nc = opts.numCols;

  // Row 1: firm / title banner
  ws.getRow(1).height = 26;
  const r1 = ws.getRow(1);
  r1.getCell(1).value = `AUDITLY AUDIT WORKPAPER  |  ${opts.pageTitle}`;
  r1.getCell(1).font = { bold: true, size: 12, color: { argb: COLORS.white }, name: "Calibri" };
  r1.getCell(1).fill = cellFill(COLORS.navyHeader);
  r1.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  mergeRange(ws, 1, 1, 1, nc);

  // Row 2: client / period / ref metadata
  ws.getRow(2).height = 17;
  const metaData = [
    ["CLIENT", opts.clientName],
    ["ENGAGEMENT", opts.engagementName],
    ["PERIOD", opts.period],
    ["CONTROL REF", opts.controlRef],
    ["TYPE / FREQ", `${opts.controlType} | ${opts.frequency}`],
    ["RISK", opts.riskLevel],
  ];
  let col = 1;
  for (const [lbl, val] of metaData) {
    const lc = ws.getRow(2).getCell(col);
    lc.value = lbl;
    lc.font = { bold: true, size: 9, color: { argb: COLORS.navyHeader }, name: "Arial" };
    lc.fill = cellFill(COLORS.midBlue);
    lc.alignment = { horizontal: "right", vertical: "middle" };
    lc.border = thinBorder();
    const vc = ws.getRow(2).getCell(col + 1);
    vc.value = val;
    vc.font = { size: 10, name: "Calibri" };
    vc.border = thinBorder();
    vc.alignment = { vertical: "middle" };
    col += 2;
    if (col > nc - 1) break;
  }

  // Row 3: sign-off block
  ws.getRow(3).height = 17;
  const signoffs = [
    { lbl: "PREPARED BY", name: opts.preparedBy, date: opts.preparedDate, color: COLORS.navyHeader },
    { lbl: "REVIEWED BY (MGR)", name: opts.reviewedBy, date: opts.reviewedDate, color: "6C3483" },
    { lbl: "APPROVED BY (DIR)", name: opts.approvedBy ?? "Pending", date: opts.approvedDate ?? "", color: "1A5276" },
  ];
  col = 1;
  const colsPerBlock = Math.floor(nc / 3);
  for (const so of signoffs) {
    const end = col + colsPerBlock - 1;
    const cell = ws.getRow(3).getCell(col);
    cell.value = `${so.lbl}: ${so.name}${so.date ? `  |  ${so.date}` : ""}`;
    cell.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
    cell.fill = cellFill(so.color);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder();
    mergeRange(ws, 3, col, 3, Math.min(end, nc));
    col = end + 1;
  }

  // Row 4: thin gold divider
  ws.getRow(4).height = 4;
  const divCell = ws.getRow(4).getCell(1);
  divCell.fill = cellFill(COLORS.gold);
  mergeRange(ws, 4, 1, 4, nc);
}

function applySection(ws: ExcelJS.Worksheet, rowNum: number, title: string, content: string, numCols = 8): number {
  ws.getRow(rowNum).height = 15;
  const titleRow = ws.getRow(rowNum);
  const tc = titleRow.getCell(1);
  tc.value = title.toUpperCase();
  tc.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
  tc.fill = cellFill(COLORS.navyLight);
  tc.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  tc.border = thinBorder();
  mergeRange(ws, rowNum, 1, rowNum, numCols);

  const lines = content.split("\n");
  const contentRow = ws.getRow(rowNum + 1);
  contentRow.getCell(1).value = content;
  contentRow.getCell(1).alignment = { wrapText: true, vertical: "top", indent: 1 };
  contentRow.getCell(1).font = { size: 10, name: "Calibri" };
  contentRow.getCell(1).border = thinBorder();
  contentRow.height = Math.max(30, lines.length * 14 + 6);
  mergeRange(ws, rowNum + 1, 1, rowNum + 1, numCols);

  return rowNum + 2;
}

// ── GTest (General Test) sheet builder ───────────────────────────────────────

const GTEST_COLUMNS: Record<string, { key: string; label: string; width: number }[]> = {
  CM: [
    { key: "itemNo",      label: "#",                                    width: 4  },
    { key: "ticketRef",   label: "Ticket #",                             width: 12 },
    { key: "description", label: "Change Description",                   width: 28 },
    { key: "requester",   label: "Requester",                            width: 14 },
    { key: "approver",    label: "Approver",                             width: 14 },
    { key: "preApproval", label: "Pre-Approval\nPrior to Deploy ^*",     width: 14 },
    { key: "sod",         label: "SOD: Req ≠\nApprover ≠ Impl ^",       width: 14 },
    { key: "testingEvidence", label: "Testing Evidence\nDocumented *",   width: 14 },
    { key: "uat",         label: "UAT /\nBiz Sign-off *",                width: 12 },
    { key: "postImpl",    label: "Post-Impl\nReview *",                  width: 12 },
    { key: "emergency",   label: "Emergency\nChange?",                   width: 10 },
    { key: "result",      label: "RESULT",                               width: 10 },
    { key: "auditorNotes",label: "Auditor Notes / Exception Detail",     width: 38 },
  ],
  AM: [
    { key: "itemNo",       label: "#",                                   width: 4  },
    { key: "ticketRef",    label: "User / Account",                      width: 18 },
    { key: "description",  label: "Role / Profile",                      width: 20 },
    { key: "requestOnFile",label: "Request\nOn File ^*",                 width: 12 },
    { key: "managerApproval", label: "Manager\nApproval *",              width: 12 },
    { key: "roleMatch",    label: "Access Matches\nRole #",              width: 14 },
    { key: "lastLogin",    label: "Last Login\nDate ^",                  width: 12 },
    { key: "revokedSLA",   label: "Revoked\nIn SLA ^*",                  width: 12 },
    { key: "recertified",  label: "In Last\nReview *",                   width: 12 },
    { key: "result",       label: "RESULT",                              width: 10 },
    { key: "auditorNotes", label: "Auditor Notes / Exception Detail",    width: 38 },
  ],
  CO: [
    { key: "itemNo",           label: "#",                               width: 4  },
    { key: "ticketRef",        label: "Job / Batch Name",                width: 22 },
    { key: "description",      label: "Description",                     width: 22 },
    { key: "completedOnTime",  label: "Completed\nOn Time ^",            width: 14 },
    { key: "failureHandled",   label: "Failures\nInvestigated *",        width: 14 },
    { key: "backupVerified",   label: "Backup\nVerified *",              width: 12 },
    { key: "monitoringAlert",  label: "Alert\nGenerated ^",              width: 12 },
    { key: "restoreTested",    label: "Restore\nTested #",               width: 12 },
    { key: "result",           label: "RESULT",                          width: 10 },
    { key: "auditorNotes",     label: "Auditor Notes / Exception Detail",width: 38 },
  ],
  PD: [
    { key: "itemNo",         label: "#",                                 width: 4  },
    { key: "ticketRef",      label: "Project / Release",                 width: 22 },
    { key: "description",    label: "Description",                       width: 22 },
    { key: "charter",        label: "Project\nCharter ^*",               width: 12 },
    { key: "requirements",   label: "Requirements\nDoc'd ^",             width: 14 },
    { key: "testingEvidence",label: "Testing Evidence\n(Unit/UAT) *",    width: 14 },
    { key: "businessSignoff",label: "Biz Owner\nSign-off *",             width: 14 },
    { key: "goLiveApproval", label: "Go-Live\nAuthorized ^*",            width: 14 },
    { key: "training",       label: "User Training\nCompleted *",        width: 14 },
    { key: "result",         label: "RESULT",                            width: 10 },
    { key: "auditorNotes",   label: "Auditor Notes / Exception Detail",  width: 38 },
  ],
};

// ── Main workbook builder ─────────────────────────────────────────────────────

export async function buildWorkbook(params: {
  engagement: { clientName: string; fiscalYear: number; periodStart: Date; periodEnd: Date; framework: string };
  controls: Array<{
    controlRef: string;
    domain: string;
    objective: string;
    frequency: string;
    riskLevel: string;
    status: string;
    itgcType?: string | null;
    itacType?: string | null;
    assignedTo?: string | null;
  }>;
  workpapers: Array<{
    controlRef: string;
    phase?: string | null;
    procedureFinal?: string | null;
    procedureDraft?: string | null;
    resultsFinal?: string | null;
    resultsDraft?: string | null;
    conclusionFinal?: string | null;
    conclusionDraft?: string | null;
    conclusion: string;
    sampleSize?: number | null;
    populationCount?: number | null;
    populationDescription?: string | null;
    samplingRationale?: string | null;
    preparedBy?: string | null;
    reviewedBy?: string | null;
    approvedBy?: string | null;
    preparedAt?: Date | null;
    reviewedAt?: Date | null;
    approvedAt?: Date | null;
    testDetail?: TestDetailResult | null;
  }>;
  pbcItems: Array<{
    description: string;
    controlRef?: string;
    status: string;
    receivedDate?: Date | null;
    dueDate?: Date | null;
    fileName?: string | null;
    notes?: string | null;
    annotatedImageUrl?: string | null;
    annotatedImageBase64?: string | null;
    annotations?: unknown | null;
    testAttributes?: unknown | null;
  }>;
  exceptions: Array<{
    controlRef: string;
    description: string;
    severity: string;
    status: string;
    rootCause?: string | null;
    managementResponse?: string | null;
    remediationPlan?: string | null;
  }>;
  ipeItems: Array<{
    reportName: string;
    system: string;
    completenessStatus: string;
    accuracyStatus: string;
    parameters?: string | null;
    linkedControls?: string[] | null;
  }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Auditly";
  wb.created = new Date();
  wb.properties.date1904 = false;

  const period = `${format(params.engagement.periodStart, "MMM d")} – ${format(params.engagement.periodEnd, "MMM d, yyyy")}`;
  const today = format(new Date(), "MM/dd/yyyy");

  // ── TAB 1: Cover / Index ─────────────────────────────────────────────────
  const wsIndex = wb.addWorksheet("Index");
  const idxCols = [
    { key: "ref",       width: 13 },
    { key: "domain",    width: 8  },
    { key: "type",      width: 8  },
    { key: "objective", width: 42 },
    { key: "freq",      width: 12 },
    { key: "risk",      width: 8  },
    { key: "status",    width: 14 },
    { key: "preparer",  width: 16 },
    { key: "gtest",     width: 14 },
  ];
  wsIndex.columns = idxCols;
  applyPrintSetup(wsIndex, { clientName: params.engagement.clientName, freezeRow: 4, filterRow: 4, tabColor: COLORS.navyHeader });

  // Cover banner
  wsIndex.getRow(1).height = 32;
  wsIndex.getRow(1).getCell(1).value = `SOX AUDIT WORKPAPER — ${params.engagement.clientName.toUpperCase()}  |  FY${params.engagement.fiscalYear}  |  ${period}`;
  wsIndex.getRow(1).getCell(1).font = { bold: true, size: 12, color: { argb: COLORS.white }, name: "Calibri" };
  wsIndex.getRow(1).getCell(1).fill = cellFill(COLORS.navyHeader);
  wsIndex.getRow(1).getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  mergeRange(wsIndex, 1, 1, 1, idxCols.length);

  wsIndex.getRow(2).height = 14;
  wsIndex.getRow(2).getCell(1).value = `Framework: ${params.engagement.framework}   |   Generated by Auditly   |   ${today}   |   CONFIDENTIAL — FOR AUDIT USE ONLY`;
  wsIndex.getRow(2).getCell(1).font = { italic: true, size: 9, color: { argb: COLORS.grey }, name: "Arial" };
  wsIndex.getRow(2).getCell(1).fill = cellFill(COLORS.midBlue);
  mergeRange(wsIndex, 2, 1, 2, idxCols.length);

  // Column headers
  const idxHdr = wsIndex.getRow(4);
  idxHdr.height = 17;
  const idxHdrValues = ["Control Ref", "Domain", "Type", "Objective", "Frequency", "Risk", "Status", "Assigned To", "GTest Sheet"];
  idxHdrValues.forEach((v, i) => {
    const c = idxHdr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
    c.fill = cellFill(COLORS.navyHeader);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  let idxRow = 5;
  for (const ctrl of params.controls) {
    const wp = params.workpapers.find(w => w.controlRef === ctrl.controlRef);
    const hasGTest = !!(wp?.testDetail?.rows?.length);
    const r = wsIndex.getRow(idxRow);
    r.height = 14;
    const statusColor = ctrl.status === "Complete" ? COLORS.green : ctrl.status === "Exception" ? COLORS.red : ctrl.status === "InProgress" ? COLORS.orange : COLORS.grey;
    const bgColor = idxRow % 2 === 0 ? COLORS.greyLight : COLORS.white;

    const vals = [
      ctrl.controlRef,
      ctrl.domain,
      ctrl.itgcType ?? ctrl.itacType ?? "",
      ctrl.objective,
      ctrl.frequency,
      ctrl.riskLevel,
      ctrl.status,
      ctrl.assignedTo ?? "",
      hasGTest ? `${ctrl.controlRef} GTest` : "",
    ];
    vals.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v;
      c.font = { size: 9, name: "Arial", bold: i === 6, color: { argb: i === 6 ? statusColor : COLORS.navyHeader } };
      c.fill = cellFill(bgColor);
      c.alignment = { vertical: "middle", wrapText: i === 3 };
      c.border = thinBorder();
    });
    idxRow++;
  }

  // ── TAB 2: PBC Tracker ───────────────────────────────────────────────────
  const wsPbc = wb.addWorksheet("PBC Tracker");
  wsPbc.columns = [
    { key: "num",         width: 5  },
    { key: "control",     width: 10 },
    { key: "description", width: 42 },
    { key: "fileName",    width: 30 },
    { key: "status",      width: 13 },
    { key: "due",         width: 13 },
    { key: "received",    width: 13 },
    { key: "age",         width: 10 },
    { key: "notes",       width: 30 },
  ];
  applyPrintSetup(wsPbc, { clientName: params.engagement.clientName, freezeRow: 1, filterRow: 1, tabColor: "2A6099" });
  const pbcHdrVals = ["#", "Control", "PBC Description", "File Name", "Status", "Due Date", "Received", "Days Open", "Notes"];
  const pbcHdr = wsPbc.getRow(1);
  pbcHdr.height = 17;
  pbcHdrVals.forEach((v, i) => {
    const c = pbcHdr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
    c.fill = cellFill(COLORS.navyHeader);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  params.pbcItems.forEach((pbc, idx) => {
    const age = pbc.status !== "Accepted" && pbc.dueDate
      ? Math.max(0, Math.floor((Date.now() - new Date(pbc.dueDate).getTime()) / 86400000)) : 0;
    const r = wsPbc.addRow({
      num: idx + 1,
      control: pbc.controlRef ?? "",
      description: pbc.description,
      fileName: pbc.fileName ?? "",
      status: pbc.status,
      due: pbc.dueDate ? format(new Date(pbc.dueDate), "MMM d, yyyy") : "",
      received: pbc.receivedDate ? format(new Date(pbc.receivedDate), "MMM d, yyyy") : "",
      age: age > 0 ? age : "",
      notes: pbc.notes ?? "",
    });
    r.height = 14;
    const bg = idx % 2 === 0 ? COLORS.greyLight : COLORS.white;
    r.eachCell(c => { c.font = { size: 10, name: "Calibri" }; c.fill = cellFill(bg); c.border = thinBorder(); c.alignment = { vertical: "middle", wrapText: true }; });
    const sc = r.getCell(5);
    sc.font = { size: 9, name: "Arial", bold: true, color: { argb: pbc.status === "Accepted" ? COLORS.green : pbc.status === "Rejected" ? COLORS.red : COLORS.orange } };
    if (age > 7) { const ac = r.getCell(8); ac.font = { size: 9, name: "Arial", bold: true, color: { argb: COLORS.red } }; }
  });

  // ── TAB 3: IPE Register ──────────────────────────────────────────────────
  const wsIpe = wb.addWorksheet("IPE Register");
  wsIpe.columns = [
    { key: "report",       width: 30 },
    { key: "system",       width: 18 },
    { key: "params",       width: 30 },
    { key: "controls",     width: 18 },
    { key: "completeness", width: 14 },
    { key: "accuracy",     width: 14 },
  ];
  const ipeHdrVals = ["Report Name", "System", "Parameters / Run Config", "Linked Controls", "Completeness", "Accuracy"];
  const ipeHdr = wsIpe.getRow(1);
  ipeHdr.height = 17;
  ipeHdrVals.forEach((v, i) => {
    const c = ipeHdr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
    c.fill = cellFill(COLORS.navyHeader);
    c.border = thinBorder();
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  params.ipeItems.forEach((ipe, idx) => {
    const r = wsIpe.addRow({
      report: ipe.reportName,
      system: ipe.system,
      params: ipe.parameters ?? "",
      controls: ipe.linkedControls?.join(", ") ?? "",
      completeness: ipe.completenessStatus,
      accuracy: ipe.accuracyStatus,
    });
    r.height = 14;
    const bg = idx % 2 === 0 ? COLORS.greyLight : COLORS.white;
    r.eachCell(c => { c.font = { size: 10, name: "Calibri" }; c.fill = cellFill(bg); c.border = thinBorder(); c.alignment = { vertical: "middle" }; });
    const colorFn = (v: string) => v === "Pass" ? COLORS.green : v === "Exception" ? COLORS.red : COLORS.orange;
    r.getCell(5).font = { size: 9, name: "Arial", bold: true, color: { argb: colorFn(ipe.completenessStatus) } };
    r.getCell(6).font = { size: 9, name: "Arial", bold: true, color: { argb: colorFn(ipe.accuracyStatus) } };
  });
  applyPrintSetup(wsIpe, { clientName: params.engagement.clientName, freezeRow: 1, filterRow: 1, tabColor: "5B4A8C" });

  // ── TAB 4+: Per-control workpapers ───────────────────────────────────────
  for (const wp of params.workpapers) {
    const ctrl = params.controls.find(c => c.controlRef === wp.controlRef);
    if (!ctrl) continue;

    const nc = 10;
    const ws = wb.addWorksheet(wp.controlRef.slice(0, 31));
    ws.columns = Array.from({ length: nc }, (_, i) => i === 0
      ? { key: `c${i}`, width: 22 }
      : i === nc - 1 ? { key: `c${i}`, width: 30 } : { key: `c${i}`, width: 14 });

    const preparedBy = wp.preparedBy ?? "Pending";
    const reviewedBy = wp.reviewedBy ?? "Pending review";
    const preparedDate = wp.preparedAt ? format(new Date(wp.preparedAt), "MM/dd/yy") : today;
    const reviewedDate = wp.reviewedAt ? format(new Date(wp.reviewedAt), "MM/dd/yy") : "";

    const phaseLabel = wp.phase === "TOD" ? "TEST OF DESIGN" : wp.phase === "Rollforward" ? "ROLLFORWARD" : "TEST OF OPERATING EFFECTIVENESS";
    applyWorkpaperHeader(ws, {
      clientName: params.engagement.clientName,
      engagementName: `SOX FY${params.engagement.fiscalYear}`,
      period,
      controlRef: wp.controlRef,
      controlType: ctrl.itgcType ?? ctrl.itacType ?? ctrl.domain,
      riskLevel: ctrl.riskLevel,
      frequency: ctrl.frequency,
      preparedBy,
      preparedDate,
      reviewedBy,
      reviewedDate,
      approvedBy: wp.approvedBy ?? undefined,
      approvedDate: wp.approvedAt ? format(new Date(wp.approvedAt), "MM/dd/yy") : undefined,
      pageTitle: `WORKPAPER — ${phaseLabel}`,
      numCols: nc,
    });

    let row = 5;
    row = applySection(ws, row, "CONTROL OBJECTIVE", ctrl.objective, nc);

    const popText = [
      wp.populationDescription ? `Population: ${wp.populationDescription}` : "",
      wp.populationCount ? `Total population: ${wp.populationCount.toLocaleString()} items` : "",
      wp.sampleSize ? `Sample selected: ${wp.sampleSize} items (PCAOB AS 2315)` : "",
      wp.samplingRationale ? `Sampling rationale: ${wp.samplingRationale}` : "",
    ].filter(Boolean).join("\n");
    if (popText) row = applySection(ws, row, "POPULATION & SAMPLING", popText, nc);

    const procedure = wp.procedureFinal ?? wp.procedureDraft ?? "";
    if (procedure) row = applySection(ws, row, "PROCEDURE PERFORMED", procedure, nc);

    const results = wp.resultsFinal ?? wp.resultsDraft ?? "";
    if (results) row = applySection(ws, row, "RESULTS OF TESTING", results, nc);

    // Conclusion
    const conclusionText = wp.conclusionFinal ?? wp.conclusionDraft ?? "";
    if (conclusionText) {
      const isPass = wp.conclusion === "Pass";
      const cLabel = ws.getRow(row);
      cLabel.getCell(1).value = `CONCLUSION — ${isPass ? "NO EXCEPTIONS NOTED" : "EXCEPTION(S) NOTED"}`;
      cLabel.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
      cLabel.getCell(1).fill = cellFill(isPass ? COLORS.green : COLORS.red);
      cLabel.getCell(1).border = thinBorder();
      cLabel.height = 14;
      mergeRange(ws, row, 1, row, nc);
      row++;

      const cText = ws.getRow(row);
      cText.getCell(1).value = conclusionText;
      cText.getCell(1).font = { size: 10, name: "Calibri" };
      cText.getCell(1).fill = cellFill(isPass ? COLORS.greenLight : COLORS.redLight);
      cText.getCell(1).alignment = { wrapText: true, vertical: "top", indent: 1 };
      cText.getCell(1).border = thinBorder();
      cText.height = 50;
      mergeRange(ws, row, 1, row, nc);
      row++;
    }

    // ── Inline sample testing table (Big 4 style: embedded in same sheet) ──
    if (wp.testDetail?.rows?.length) {
      const controlType = ctrl.itgcType ?? ctrl.itacType ?? "CM";
      const testColumns = GTEST_COLUMNS[controlType] ?? GTEST_COLUMNS.CM;
      const tnc = testColumns.length;

      row++;
      // Section divider
      const testHdrLabel = ws.getRow(row);
      testHdrLabel.getCell(1).value = `SAMPLE TESTING DETAIL — ${wp.sampleSize ?? testColumns.length} ITEMS SELECTED`;
      testHdrLabel.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
      testHdrLabel.getCell(1).fill = cellFill(COLORS.navyHeader);
      testHdrLabel.getCell(1).border = thinBorder();
      testHdrLabel.height = 16;
      mergeRange(ws, row, 1, row, nc);
      row++;

      // Column headers for test table
      const testColHdr = ws.getRow(row);
      testColHdr.height = 36;
      testColumns.forEach((col, i) => {
        if (i >= nc) return;
        const cell = testColHdr.getCell(i + 1);
        cell.value = col.label;
        cell.font = { bold: true, size: 9, color: { argb: COLORS.white }, name: "Calibri" };
        cell.fill = cellFill(COLORS.navyLight);
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thinBorder();
      });
      row++;

      // Sample item rows
      for (const item of wp.testDetail.rows) {
        const dataRow = ws.getRow(row);
        dataRow.height = 16;
        const isException = item.overallResult === "Exception";
        const rowBg = isException ? COLORS.redLight : (row % 2 === 0 ? COLORS.greyLight : COLORS.white);
        testColumns.forEach((col, i) => {
          if (i >= nc) return;
          const cell = dataRow.getCell(i + 1);
          const attr = item.attributes?.[col.key];
          let value: string | number = "";
          if (col.key === "itemNo")        value = item.itemNo;
          else if (col.key === "ticketRef")    value = item.ticketRef ?? "";
          else if (col.key === "description")  value = item.description ?? "";
          else if (col.key === "result")       value = item.overallResult ?? "";
          else if (col.key === "auditorNotes") value = item.auditorNotes ?? "";
          else if (attr) value = attr.result === "Exception" ? `! ${attr.note || "Exception"}` : attr.tickmark || attr.result || "";
          cell.value = value;
          cell.font = {
            size: 9, name: "Calibri",
            bold: col.key === "result",
            color: { argb: col.key === "result" ? (item.overallResult === "Pass" ? COLORS.green : COLORS.red) : (attr?.result === "Exception" ? COLORS.red : "000000") },
          };
          cell.fill = cellFill(rowBg);
          cell.alignment = { horizontal: col.key === "auditorNotes" || col.key === "description" ? "left" : "center", vertical: "middle", wrapText: col.key === "description" || col.key === "auditorNotes" };
          cell.border = thinBorder();
        });
        row++;
      }

      // Summary row
      const exceptionCount = wp.testDetail.rows.filter(r => r.overallResult === "Exception").length;
      const summaryRow = ws.getRow(row);
      summaryRow.getCell(1).value = `TOTAL TESTED: ${wp.testDetail.rows.length}  |  EXCEPTIONS: ${exceptionCount}  |  RATE: ${wp.testDetail.exceptionRate}`;
      summaryRow.getCell(1).font = { bold: true, size: 9, name: "Calibri", color: { argb: exceptionCount > 0 ? COLORS.red : COLORS.green } };
      summaryRow.getCell(1).fill = cellFill(exceptionCount > 0 ? COLORS.redLight : COLORS.greenLight);
      summaryRow.getCell(1).border = thinBorder();
      summaryRow.height = 14;
      mergeRange(ws, row, 1, row, nc);
      row++;

      // Manager conclusion
      if (wp.testDetail.managerDraftConclusion) {
        row++;
        const concLabel = ws.getRow(row);
        concLabel.getCell(1).value = "CONCLUSION (DRAFT)";
        concLabel.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
        concLabel.getCell(1).fill = cellFill(exceptionCount > 0 ? COLORS.red : COLORS.green);
        concLabel.getCell(1).border = thinBorder();
        concLabel.height = 14;
        mergeRange(ws, row, 1, row, nc);
        row++;
        const concText = ws.getRow(row);
        concText.getCell(1).value = wp.testDetail.managerDraftConclusion;
        concText.getCell(1).font = { size: 10, name: "Calibri" };
        concText.getCell(1).fill = cellFill(exceptionCount > 0 ? COLORS.redLight : COLORS.greenLight);
        concText.getCell(1).alignment = { wrapText: true, vertical: "top", indent: 1 };
        concText.getCell(1).border = thinBorder();
        concText.height = 45;
        mergeRange(ws, row, 1, row, nc);
        row++;
      }
    }

    // Tab color by status
    const tabColor = ctrl.status === "Complete" ? "27AE60" : ctrl.status === "Exception" ? "E74C3C" : ctrl.status === "InProgress" ? "F39C12" : "95A5A6";
    applyPrintSetup(ws, { clientName: params.engagement.clientName, freezeRow: 4, tabColor });
  }

  // ── Evidence / Annotated Screenshots ─────────────────────────────────────
  const annotatedPbc = params.pbcItems.filter(p => (p.annotatedImageBase64 || p.annotatedImageUrl) && p.status === "Accepted");
  if (annotatedPbc.length > 0) {
    const wsEvid = wb.addWorksheet("Evidence Screenshots");
    wsEvid.columns = [
      { key: "ref",   width: 14 },
      { key: "file",  width: 36 },
      { key: "attrs", width: 60 },
      { key: "note",  width: 40 },
    ];

    // Sheet header
    const evidHdr = wsEvid.getRow(1);
    evidHdr.height = 18;
    ["Control Ref", "File Name", "Test Attribute Annotations", "Notes"].forEach((v, i) => {
      const c = evidHdr.getCell(i + 1);
      c.value = v;
      c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
      c.fill = cellFill(COLORS.navyHeader);
      c.border = thinBorder();
      c.alignment = { horizontal: "center", vertical: "middle" };
    });

    let evidRow = 2;

    for (const pbc of annotatedPbc) {
      const attrs = Array.isArray(pbc.testAttributes) ? (pbc.testAttributes as { key: string; label: string }[]) : [];
      const boxes = Array.isArray(pbc.annotations) ? (pbc.annotations as { testAttribute?: string; label: string; reason: string }[]) : [];

      // Group boxes by test attribute key
      const attrSummary = attrs.map(attr => {
        const attrBoxes = boxes.filter(b => b.testAttribute === attr.key);
        return `[${attr.key}] ${attr.label}: ${attrBoxes.length > 0 ? attrBoxes.map(b => b.label || b.reason || attr.label).join("; ") : "Not annotated"}`;
      }).join("\n");

      // Metadata row
      const metaRow = wsEvid.getRow(evidRow);
      metaRow.getCell(1).value = pbc.controlRef ?? "—";
      metaRow.getCell(2).value = pbc.fileName ?? "screenshot";
      metaRow.getCell(3).value = attrSummary || "No test attributes assigned";
      metaRow.getCell(4).value = pbc.notes ?? "";
      metaRow.eachCell(c => {
        c.font = { size: 10, name: "Calibri" };
        c.fill = cellFill(COLORS.lightBlue);
        c.border = thinBorder();
        c.alignment = { wrapText: true, vertical: "top" };
      });
      metaRow.getCell(1).font = { bold: true, size: 9, name: "Arial", color: { argb: COLORS.navyHeader } };
      metaRow.height = Math.max(30, (attrs.length + 1) * 14);
      evidRow++;

      // Embed annotated image
      try {
        let imgBuffer: Buffer | null = null;
        if (pbc.annotatedImageBase64) {
          imgBuffer = Buffer.from(pbc.annotatedImageBase64, "base64");
        } else if (pbc.annotatedImageUrl) {
          const imgResponse = await fetch(pbc.annotatedImageUrl);
          if (imgResponse.ok) imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
        }
        if (imgBuffer && imgBuffer.length > 100) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imageId = wb.addImage({ buffer: imgBuffer as any, extension: "png" });
          wsEvid.addImage(imageId, {
            tl: { col: 0, row: evidRow - 1 },
            ext: { width: 600, height: 340 },
          });
          // Reserve rows for the image (approx 340px at ~15px/row = 23 rows)
          for (let ri = 0; ri < 23; ri++) {
            const imgRow = wsEvid.getRow(evidRow + ri);
            imgRow.height = 15;
          }
          evidRow += 23;
        }
      } catch {
        // Image fetch failed — skip embedding, row data still there
      }

      // Attribute legend below image
      if (attrs.length > 0) {
        const legendHdr = wsEvid.getRow(evidRow);
        legendHdr.getCell(1).value = "KEY";
        legendHdr.getCell(2).value = "TEST ATTRIBUTE";
        legendHdr.getCell(3).value = "BOXES ANNOTATED";
        legendHdr.getCell(4).value = "COVERAGE";
        legendHdr.eachCell(c => {
          c.font = { bold: true, size: 8, name: "Arial", color: { argb: COLORS.white } };
          c.fill = cellFill(COLORS.navyLight);
          c.border = thinBorder();
          c.alignment = { horizontal: "center", vertical: "middle" };
        });
        legendHdr.height = 13;
        evidRow++;

        attrs.forEach(attr => {
          const attrBoxes = boxes.filter(b => b.testAttribute === attr.key);
          const r = wsEvid.getRow(evidRow);
          r.getCell(1).value = attr.key;
          r.getCell(2).value = attr.label;
          r.getCell(3).value = attrBoxes.map(b => b.label || b.reason).filter(Boolean).join("; ") || "None";
          r.getCell(4).value = attrBoxes.length > 0 ? "Evidenced" : "Pending";
          r.eachCell(c => {
            c.font = { size: 10, name: "Calibri" };
            c.fill = cellFill(attrBoxes.length > 0 ? COLORS.greenLight : COLORS.orangeLight);
            c.border = thinBorder();
            c.alignment = { wrapText: true, vertical: "middle" };
          });
          r.getCell(4).font = { bold: true, size: 9, name: "Arial", color: { argb: attrBoxes.length > 0 ? COLORS.green : COLORS.orange } };
          r.height = 13;
          evidRow++;
        });
      }

      // Gap between screenshots
      evidRow += 2;
    }
    applyPrintSetup(wsEvid, { clientName: params.engagement.clientName, freezeRow: 1, landscape: true, tabColor: "1E8449" });
  }

  // ── Exception Log ────────────────────────────────────────────────────────
  if (params.exceptions.length > 0) {
    const wsExc = wb.addWorksheet("Exception Log");
    wsExc.columns = [
      { key: "ref",      width: 5  },
      { key: "control",  width: 10 },
      { key: "desc",     width: 40 },
      { key: "severity", width: 22 },
      { key: "status",   width: 16 },
      { key: "root",     width: 35 },
      { key: "mgmt",     width: 38 },
      { key: "remed",    width: 38 },
    ];
    const excHdrVals = ["Ref #", "Control", "Exception Description", "Severity", "Status", "Root Cause", "Management Response", "Remediation Plan"];
    const excHdr = wsExc.getRow(1);
    excHdr.height = 17;
    excHdrVals.forEach((v, i) => {
      const c = excHdr.getCell(i + 1);
      c.value = v;
      c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
      c.fill = cellFill(COLORS.red);
      c.border = thinBorder();
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    params.exceptions.forEach((exc, idx) => {
      const r = wsExc.addRow({
        ref: `E-${String(idx + 1).padStart(2, "0")}`,
        control: exc.controlRef,
        desc: exc.description,
        severity: exc.severity,
        status: exc.status,
        root: exc.rootCause ?? "",
        mgmt: exc.managementResponse ?? "",
        remed: exc.remediationPlan ?? "",
      });
      r.height = 30;
      r.eachCell(c => { c.font = { size: 10, name: "Calibri" }; c.fill = cellFill(COLORS.redLight); c.border = thinBorder(); c.alignment = { wrapText: true, vertical: "top" }; });
      const sevColor = exc.severity === "Material Weakness" ? COLORS.red : exc.severity === "Significant Deficiency" ? COLORS.orange : COLORS.grey;
      r.getCell(4).font = { bold: true, size: 9, name: "Arial", color: { argb: sevColor } };
    });
    applyPrintSetup(wsExc, { clientName: params.engagement.clientName, freezeRow: 1, filterRow: 1, tabColor: COLORS.red });
  }

  // ── Tickmark Legend ──────────────────────────────────────────────────────
  const wsTick = wb.addWorksheet("Tickmarks");
  wsTick.columns = [{ key: "tick", width: 8 }, { key: "desc", width: 55 }, { key: "usage", width: 40 }];
  const tickHdr = wsTick.getRow(1);
  tickHdr.height = 17;
  ["Symbol", "Description", "Usage Context"].forEach((v, i) => {
    const c = tickHdr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, size: 10, color: { argb: COLORS.white }, name: "Calibri" };
    c.fill = cellFill(COLORS.navyHeader);
    c.border = thinBorder();
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  const ticks: [string, string, string][] = [
    ["^",   "Agreed to source system or population report",                 "Tie-out to the client-generated report or system screen"],
    ["*",   "Agreed to approved documentation on file",                     "Evidence of approval, sign-off, or policy compliance"],
    ["#",   "Independently reperformed or recalculated by auditor",         "Auditor independently verified the calculation or result"],
    ["~",   "Agreed to prior period or comparative data",                    "Cross-reference to prior-year workpaper or comparable"],
    ["^*",  "Agreed to source AND approved documentation",                  "Both source tie-out and document evidence verified"],
    ["!",   "Exception noted — see Exception Log",                          "Finding requires escalation; cross-ref E-XX in Exception Log"],
    ["N/A", "Not applicable to this sample item",                           "Criterion does not apply (e.g. no termination on active accounts)"],
  ];
  ticks.forEach(([tick, desc, usage], idx) => {
    const r = wsTick.addRow([tick, desc, usage]);
    r.height = 14;
    const bg = idx % 2 === 0 ? COLORS.greyLight : COLORS.white;
    r.eachCell(c => { c.font = { size: 10, name: "Calibri" }; c.fill = cellFill(bg); c.border = thinBorder(); c.alignment = { vertical: "middle" }; });
    r.getCell(1).font = { bold: true, size: 10, name: "Courier New", color: { argb: COLORS.navyHeader } };
  });
  applyPrintSetup(wsTick, { clientName: params.engagement.clientName, freezeRow: 1, tabColor: "7F8C8D" });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

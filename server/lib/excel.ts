import ExcelJS from "exceljs";
import { format } from "date-fns";

const COLORS = {
  navyHeader: "1E3A5F",
  lightBlue: "EBF3FB",
  gold: "D4AF37",
  green: "27AE60",
  red: "E74C3C",
  orange: "F39C12",
  grey: "7F8C8D",
  white: "FFFFFF",
  lightGrey: "F5F5F5",
};

function applyHeader(ws: ExcelJS.Worksheet, clientName: string, period: string, controlRef: string, preparedBy: string, reviewedBy: string) {
  ws.getRow(1).height = 30;
  const headerRow = ws.getRow(1);
  headerRow.getCell(1).value = "AUDITLY — WORKPAPER";
  headerRow.getCell(1).font = { bold: true, size: 14, color: { argb: COLORS.white } };
  headerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyHeader } };
  ws.mergeCells("A1:H1");

  const metaRow = ws.getRow(2);
  metaRow.values = ["Client:", clientName, "Period:", period, "Control:", controlRef, "Prepared by:", preparedBy];
  metaRow.font = { size: 10 };
  metaRow.getCell(1).font = { bold: true, size: 10 };
  metaRow.getCell(3).font = { bold: true, size: 10 };
  metaRow.getCell(5).font = { bold: true, size: 10 };
  metaRow.getCell(7).font = { bold: true, size: 10 };

  const reviewRow = ws.getRow(3);
  reviewRow.values = ["", "", "", "", "", "", "Reviewed by:", reviewedBy ?? "Pending review"];
  reviewRow.getCell(7).font = { bold: true, size: 10 };

  ws.getRow(4).height = 8; // spacer
}

function applySection(ws: ExcelJS.Worksheet, rowNum: number, title: string, content: string): number {
  const titleRow = ws.getRow(rowNum);
  titleRow.getCell(1).value = title.toUpperCase();
  titleRow.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white } };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyHeader } };
  ws.mergeCells(`A${rowNum}:H${rowNum}`);

  const contentRow = ws.getRow(rowNum + 1);
  contentRow.getCell(1).value = content;
  contentRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  contentRow.height = Math.max(40, Math.ceil(content.length / 80) * 15);
  ws.mergeCells(`A${rowNum + 1}:H${rowNum + 1}`);
  ws.getRow(rowNum + 2).height = 8;
  return rowNum + 3;
}

export async function buildWorkbook(params: {
  engagement: { clientName: string; fiscalYear: number; periodStart: Date; periodEnd: Date; framework: string };
  controls: Array<{
    controlRef: string;
    domain: string;
    objective: string;
    frequency: string;
    riskLevel: string;
    status: string;
    assignedTo?: string | null;
  }>;
  workpapers: Array<{
    controlRef: string;
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
    preparedBy?: string | null;
    reviewedBy?: string | null;
    preparedAt?: Date | null;
  }>;
  pbcItems: Array<{ description: string; controlRef?: string; status: string; receivedDate?: Date | null; dueDate?: Date | null; fileName?: string | null }>;
  exceptions: Array<{ controlRef: string; description: string; severity: string; status: string; managementResponse?: string | null; remediationPlan?: string | null }>;
  ipeItems: Array<{ reportName: string; system: string; completenessStatus: string; accuracyStatus: string; parameters?: string | null; linkedControls?: string[] | null }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Auditly";
  wb.created = new Date();

  const period = `${format(params.engagement.periodStart, "MMM d")} – ${format(params.engagement.periodEnd, "MMM d, yyyy")}`;

  // ── TAB 1: Index ──────────────────────────────────────────────────────────
  const wsIndex = wb.addWorksheet("Index");
  wsIndex.columns = [
    { header: "Control Ref", key: "ref", width: 12 },
    { header: "Domain", key: "domain", width: 8 },
    { header: "Objective", key: "objective", width: 40 },
    { header: "Frequency", key: "frequency", width: 12 },
    { header: "Risk", key: "risk", width: 8 },
    { header: "Status", key: "status", width: 14 },
    { header: "Assigned To", key: "assigned", width: 18 },
  ];
  const indexHeader = wsIndex.getRow(1);
  indexHeader.font = { bold: true, color: { argb: COLORS.white } };
  indexHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyHeader } };

  for (const ctrl of params.controls) {
    const row = wsIndex.addRow({
      ref: ctrl.controlRef,
      domain: ctrl.domain,
      objective: ctrl.objective,
      frequency: ctrl.frequency,
      risk: ctrl.riskLevel,
      status: ctrl.status,
      assigned: ctrl.assignedTo ?? "",
    });
    const color = ctrl.status === "Complete" ? COLORS.green : ctrl.status === "Exception" ? COLORS.red : ctrl.status === "InProgress" ? COLORS.orange : COLORS.grey;
    row.getCell("status").font = { color: { argb: color }, bold: true };
  }

  // ── TAB 2: PBC Tracker ───────────────────────────────────────────────────
  const wsPbc = wb.addWorksheet("PBC Tracker");
  wsPbc.columns = [
    { header: "Control", key: "control", width: 10 },
    { header: "Description", key: "description", width: 40 },
    { header: "Status", key: "status", width: 12 },
    { header: "Due Date", key: "due", width: 14 },
    { header: "Received", key: "received", width: 14 },
    { header: "File", key: "file", width: 30 },
    { header: "Days Open", key: "age", width: 10 },
  ];
  const pbcHeader = wsPbc.getRow(1);
  pbcHeader.font = { bold: true, color: { argb: COLORS.white } };
  pbcHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyHeader } };

  for (const pbc of params.pbcItems) {
    const age = pbc.status !== "Accepted" && pbc.dueDate ? Math.max(0, Math.floor((Date.now() - pbc.dueDate.getTime()) / 86400000)) : 0;
    const row = wsPbc.addRow({
      control: pbc.controlRef ?? "",
      description: pbc.description,
      status: pbc.status,
      due: pbc.dueDate ? format(pbc.dueDate, "MMM d, yyyy") : "",
      received: pbc.receivedDate ? format(pbc.receivedDate, "MMM d, yyyy") : "",
      file: pbc.fileName ?? "",
      age: age > 0 ? age : "",
    });
    if (pbc.status === "Accepted") row.getCell("status").font = { color: { argb: COLORS.green }, bold: true };
    if (pbc.status === "Rejected") row.getCell("status").font = { color: { argb: COLORS.red }, bold: true };
    if (age > 7) row.getCell("age").font = { color: { argb: COLORS.red }, bold: true };
  }

  // ── TAB 3: IPE Register ──────────────────────────────────────────────────
  const wsIpe = wb.addWorksheet("IPE Register");
  wsIpe.columns = [
    { header: "Report Name", key: "report", width: 30 },
    { header: "System", key: "system", width: 18 },
    { header: "Parameters", key: "params", width: 30 },
    { header: "Linked Controls", key: "controls", width: 18 },
    { header: "Completeness", key: "completeness", width: 14 },
    { header: "Accuracy", key: "accuracy", width: 14 },
  ];
  const ipeHeader = wsIpe.getRow(1);
  ipeHeader.font = { bold: true, color: { argb: COLORS.white } };
  ipeHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyHeader } };

  for (const ipe of params.ipeItems) {
    wsIpe.addRow({
      report: ipe.reportName,
      system: ipe.system,
      params: ipe.parameters ?? "",
      controls: ipe.linkedControls?.join(", ") ?? "",
      completeness: ipe.completenessStatus,
      accuracy: ipe.accuracyStatus,
    });
  }

  // ── TAB 4+: Per-control workpapers ───────────────────────────────────────
  for (const wp of params.workpapers) {
    const ws = wb.addWorksheet(wp.controlRef);
    ws.columns = [
      { key: "label", width: 20 },
      { key: "value", width: 80 },
    ];

    applyHeader(ws, params.engagement.clientName, period, wp.controlRef, wp.preparedBy ?? "Pending", wp.reviewedBy ?? "Pending");

    let row = 5;

    const ctrl = params.controls.find(c => c.controlRef === wp.controlRef);
    if (ctrl) {
      row = applySection(ws, row, "Control Objective", ctrl.objective);
    }

    if (wp.populationDescription || wp.populationCount) {
      row = applySection(ws, row, "Population", `${wp.populationDescription ?? ""} | Total: ${wp.populationCount ?? "N/A"} | Sample: ${wp.sampleSize ?? "N/A"}`);
    }

    const procedure = wp.procedureFinal ?? wp.procedureDraft ?? "";
    if (procedure) row = applySection(ws, row, "Procedure Performed", procedure);

    const results = wp.resultsFinal ?? wp.resultsDraft ?? "";
    if (results) row = applySection(ws, row, "Results", results);

    const conclusion = wp.conclusionFinal ?? wp.conclusionDraft ?? wp.conclusion;
    if (conclusion) {
      const conclusionRow = ws.getRow(row);
      conclusionRow.getCell(1).value = "CONCLUSION";
      conclusionRow.getCell(1).font = { bold: true, size: 10, color: { argb: COLORS.white } };
      conclusionRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: wp.conclusion === "Pass" ? COLORS.green : COLORS.red } };
      ws.mergeCells(`A${row}:H${row}`);

      const conclusionContent = ws.getRow(row + 1);
      conclusionContent.getCell(1).value = conclusion;
      conclusionContent.getCell(1).alignment = { wrapText: true };
      ws.mergeCells(`A${row + 1}:H${row + 1}`);
    }
  }

  // ── TAB: Exception Log ───────────────────────────────────────────────────
  if (params.exceptions.length > 0) {
    const wsExc = wb.addWorksheet("Exception Log");
    wsExc.columns = [
      { header: "Control", key: "control", width: 10 },
      { header: "Description", key: "description", width: 40 },
      { header: "Severity", key: "severity", width: 20 },
      { header: "Status", key: "status", width: 16 },
      { header: "Management Response", key: "mgmt", width: 40 },
      { header: "Remediation Plan", key: "remed", width: 40 },
    ];
    const excHeader = wsExc.getRow(1);
    excHeader.font = { bold: true, color: { argb: COLORS.white } };
    excHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.red } };

    for (const exc of params.exceptions) {
      wsExc.addRow({
        control: exc.controlRef,
        description: exc.description,
        severity: exc.severity,
        status: exc.status,
        mgmt: exc.managementResponse ?? "",
        remed: exc.remediationPlan ?? "",
      });
    }
  }

  // ── TAB: Tickmark Legend ─────────────────────────────────────────────────
  const wsTick = wb.addWorksheet("Tickmark Legend");
  const tickmarks = [
    ["^", "Agreed to source system / population report"],
    ["*", "Agreed to approved documentation / evidence"],
    ["#", "Reperformed / recalculated by auditor"],
    ["~", "Agreed to prior period for comparison"],
    ["!", "Exception noted — see Exception Log"],
    ["N/A", "Not applicable to this sample item"],
  ];
  wsTick.getRow(1).values = ["Tickmark", "Description"];
  wsTick.getRow(1).font = { bold: true };
  wsTick.columns = [{ key: "tick", width: 12 }, { key: "desc", width: 50 }];
  for (const [tick, desc] of tickmarks) {
    wsTick.addRow([tick, desc]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

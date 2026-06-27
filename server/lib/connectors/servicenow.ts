/**
 * ServiceNow connector — pulls change requests, incidents, and access reviews
 * for ITGC audit evidence.
 */

export interface ServiceNowCredentials {
  instanceUrl: string; // e.g. https://company.service-now.com
  username: string;
  password: string; // or OAuth client credentials
}

export interface ServiceNowRecord {
  sys_id: string;
  number: string;
  short_description: string;
  state: string;
  opened_at: string;
  closed_at?: string;
  assigned_to?: string;
  approval?: string;
  category?: string;
  risk?: string;
}

export interface PulledEvidence {
  source: string;
  recordId: string;
  summary: string;
  details: Record<string, string>;
  pulledAt: string;
}

export async function pullChangeRequests(
  credentials: ServiceNowCredentials,
  queryConfig: { dateFrom?: string; dateTo?: string; limit?: number; stateFilter?: string }
): Promise<PulledEvidence[]> {
  const { instanceUrl, username, password } = credentials;
  const limit = queryConfig.limit ?? 50;

  let sysparmQuery = "";
  if (queryConfig.dateFrom) sysparmQuery += `opened_at>=${queryConfig.dateFrom}`;
  if (queryConfig.dateTo) sysparmQuery += `^opened_at<=${queryConfig.dateTo}`;
  if (queryConfig.stateFilter) sysparmQuery += `^state=${queryConfig.stateFilter}`;

  const url = new URL(`${instanceUrl}/api/now/table/change_request`);
  url.searchParams.set("sysparm_limit", String(limit));
  url.searchParams.set("sysparm_fields", "sys_id,number,short_description,state,opened_at,closed_at,assigned_to,approval,risk,category");
  if (sysparmQuery) url.searchParams.set("sysparm_query", sysparmQuery);

  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", Authorization: authHeader },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ServiceNow API error ${response.status}: ${body}`);
  }

  const data = await response.json() as { result: ServiceNowRecord[] };

  return data.result.map(record => ({
    source: "ServiceNow",
    recordId: record.number,
    summary: `Change Request ${record.number}: ${record.short_description} (State: ${record.state}, Approval: ${record.approval ?? "N/A"})`,
    details: {
      number: record.number,
      description: record.short_description,
      state: record.state,
      approval: record.approval ?? "",
      risk: record.risk ?? "",
      category: record.category ?? "",
      opened_at: record.opened_at,
      closed_at: record.closed_at ?? "",
      assigned_to: record.assigned_to ?? "",
    },
    pulledAt: new Date().toISOString(),
  }));
}

export async function pullIncidents(
  credentials: ServiceNowCredentials,
  queryConfig: { dateFrom?: string; dateTo?: string; limit?: number; category?: string }
): Promise<PulledEvidence[]> {
  const { instanceUrl, username, password } = credentials;
  const limit = queryConfig.limit ?? 50;

  let sysparmQuery = "active=false"; // closed incidents
  if (queryConfig.dateFrom) sysparmQuery += `^resolved_at>=${queryConfig.dateFrom}`;
  if (queryConfig.dateTo) sysparmQuery += `^resolved_at<=${queryConfig.dateTo}`;
  if (queryConfig.category) sysparmQuery += `^category=${queryConfig.category}`;

  const url = new URL(`${instanceUrl}/api/now/table/incident`);
  url.searchParams.set("sysparm_limit", String(limit));
  url.searchParams.set("sysparm_fields", "sys_id,number,short_description,priority,state,resolved_at,assigned_to,category");
  url.searchParams.set("sysparm_query", sysparmQuery);

  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", Authorization: authHeader },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ServiceNow API error ${response.status}: ${body}`);
  }

  const data = await response.json() as { result: ServiceNowRecord[] };

  return data.result.map(record => ({
    source: "ServiceNow",
    recordId: record.number,
    summary: `Incident ${record.number}: ${record.short_description} (Priority: ${record.state})`,
    details: {
      number: record.number,
      description: record.short_description,
      state: record.state,
      category: record.category ?? "",
      resolved_at: record.closed_at ?? "",
      assigned_to: record.assigned_to ?? "",
    },
    pulledAt: new Date().toISOString(),
  }));
}

export async function testConnection(credentials: ServiceNowCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const { instanceUrl, username, password } = credentials;
    const url = `${instanceUrl}/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id`;
    const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: authHeader },
    });
    if (response.ok) return { ok: true, message: "Connected to ServiceNow successfully" };
    return { ok: false, message: `ServiceNow returned ${response.status}` };
  } catch (err) {
    return { ok: false, message: `Connection failed: ${String(err)}` };
  }
}

/**
 * Jira connector — pulls issues, tickets, and approval workflows
 * for ITGC change management and project management evidence.
 */

export interface JiraCredentials {
  baseUrl: string; // e.g. https://company.atlassian.net
  email: string;
  apiToken: string;
}

export interface PulledEvidence {
  source: string;
  recordId: string;
  summary: string;
  details: Record<string, string>;
  pulledAt: string;
}

function authHeader(credentials: JiraCredentials): string {
  return "Basic " + Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString("base64");
}

export async function pullIssues(
  credentials: JiraCredentials,
  queryConfig: {
    projectKey?: string;
    issueType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    jql?: string;
  }
): Promise<PulledEvidence[]> {
  const limit = queryConfig.limit ?? 50;
  let jql = queryConfig.jql ?? "";

  if (!jql) {
    const clauses: string[] = [];
    if (queryConfig.projectKey) clauses.push(`project = "${queryConfig.projectKey}"`);
    if (queryConfig.issueType) clauses.push(`issuetype = "${queryConfig.issueType}"`);
    if (queryConfig.status) clauses.push(`status = "${queryConfig.status}"`);
    if (queryConfig.dateFrom) clauses.push(`created >= "${queryConfig.dateFrom}"`);
    if (queryConfig.dateTo) clauses.push(`created <= "${queryConfig.dateTo}"`);
    jql = clauses.join(" AND ") || "ORDER BY created DESC";
  }

  const url = new URL(`${credentials.baseUrl}/rest/api/3/search`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("maxResults", String(limit));
  url.searchParams.set("fields", "summary,status,issuetype,assignee,reporter,created,updated,priority,resolution");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: authHeader(credentials),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    issues: {
      id: string;
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        issuetype: { name: string };
        assignee?: { displayName: string };
        reporter?: { displayName: string };
        created: string;
        updated: string;
        priority?: { name: string };
        resolution?: { name: string };
      };
    }[]
  };

  return data.issues.map(issue => ({
    source: "Jira",
    recordId: issue.key,
    summary: `${issue.key}: ${issue.fields.summary} (${issue.fields.issuetype.name}, Status: ${issue.fields.status.name})`,
    details: {
      key: issue.key,
      summary: issue.fields.summary,
      type: issue.fields.issuetype.name,
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name ?? "",
      assignee: issue.fields.assignee?.displayName ?? "Unassigned",
      reporter: issue.fields.reporter?.displayName ?? "",
      created: issue.fields.created,
      updated: issue.fields.updated,
      resolution: issue.fields.resolution?.name ?? "Unresolved",
    },
    pulledAt: new Date().toISOString(),
  }));
}

export async function testConnection(credentials: JiraCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${credentials.baseUrl}/rest/api/3/myself`, {
      headers: {
        Accept: "application/json",
        Authorization: authHeader(credentials),
      },
    });
    if (response.ok) {
      const data = await response.json() as { displayName: string };
      return { ok: true, message: `Connected to Jira as ${data.displayName}` };
    }
    return { ok: false, message: `Jira returned ${response.status}` };
  } catch (err) {
    return { ok: false, message: `Connection failed: ${String(err)}` };
  }
}

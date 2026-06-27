/**
 * GitHub connector — pulls pull requests, code reviews, and branch protection settings
 * for ITGC change management (CM) and software development lifecycle evidence.
 */

export interface GitHubCredentials {
  token: string; // Personal access token or GitHub App token
  org?: string;  // Organization name
}

export interface PulledEvidence {
  source: string;
  recordId: string;
  summary: string;
  details: Record<string, string>;
  pulledAt: string;
}

function authHeaders(credentials: GitHubCredentials) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${credentials.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function pullPullRequests(
  credentials: GitHubCredentials,
  queryConfig: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    dateFrom?: string;
    limit?: number;
  }
): Promise<PulledEvidence[]> {
  const limit = queryConfig.limit ?? 50;
  const state = queryConfig.state ?? "closed";
  const perPage = Math.min(limit, 100);

  const url = new URL(`https://api.github.com/repos/${queryConfig.owner}/${queryConfig.repo}/pulls`);
  url.searchParams.set("state", state);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");

  const response = await fetch(url.toString(), { headers: authHeaders(credentials) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  const prs = await response.json() as {
    number: number;
    title: string;
    state: string;
    user: { login: string };
    created_at: string;
    merged_at: string | null;
    closed_at: string | null;
    requested_reviewers: { login: string }[];
    html_url: string;
  }[];

  const filtered = queryConfig.dateFrom
    ? prs.filter(pr => new Date(pr.created_at) >= new Date(queryConfig.dateFrom!))
    : prs;

  return filtered.slice(0, limit).map(pr => ({
    source: "GitHub",
    recordId: `PR #${pr.number}`,
    summary: `PR #${pr.number}: ${pr.title} by ${pr.user.login} (${pr.state}${pr.merged_at ? ", merged" : ""})`,
    details: {
      number: String(pr.number),
      title: pr.title,
      author: pr.user.login,
      state: pr.state,
      created_at: pr.created_at,
      merged_at: pr.merged_at ?? "",
      closed_at: pr.closed_at ?? "",
      requested_reviewers: pr.requested_reviewers.map(r => r.login).join(", "),
      url: pr.html_url,
    },
    pulledAt: new Date().toISOString(),
  }));
}

export async function pullBranchProtection(
  credentials: GitHubCredentials,
  queryConfig: { owner: string; repo: string; branch?: string }
): Promise<PulledEvidence[]> {
  const branch = queryConfig.branch ?? "main";
  const url = `https://api.github.com/repos/${queryConfig.owner}/${queryConfig.repo}/branches/${branch}/protection`;

  const response = await fetch(url, { headers: authHeaders(credentials) });
  if (response.status === 404) {
    return [{
      source: "GitHub",
      recordId: `${queryConfig.repo}/${branch}`,
      summary: `Branch ${branch} has NO protection rules — this is an exception`,
      details: {
        repo: queryConfig.repo,
        branch,
        protected: "false",
        required_reviews: "0",
        require_code_owner_reviews: "false",
        dismiss_stale_reviews: "false",
        required_status_checks: "none",
      },
      pulledAt: new Date().toISOString(),
    }];
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  const protection = await response.json() as {
    required_pull_request_reviews?: {
      required_approving_review_count: number;
      require_code_owner_reviews: boolean;
      dismiss_stale_reviews: boolean;
    };
    required_status_checks?: { strict: boolean; contexts: string[] };
    enforce_admins?: { enabled: boolean };
    restrictions?: { users: { login: string }[]; teams: { slug: string }[] };
  };

  return [{
    source: "GitHub",
    recordId: `${queryConfig.repo}/${branch}`,
    summary: `Branch ${branch} protection: ${protection.required_pull_request_reviews?.required_approving_review_count ?? 0} required reviews, admin enforcement: ${protection.enforce_admins?.enabled ?? false}`,
    details: {
      repo: queryConfig.repo,
      branch,
      protected: "true",
      required_reviews: String(protection.required_pull_request_reviews?.required_approving_review_count ?? 0),
      require_code_owner_reviews: String(protection.required_pull_request_reviews?.require_code_owner_reviews ?? false),
      dismiss_stale_reviews: String(protection.required_pull_request_reviews?.dismiss_stale_reviews ?? false),
      enforce_admins: String(protection.enforce_admins?.enabled ?? false),
      required_status_checks: protection.required_status_checks?.contexts.join(", ") ?? "none",
    },
    pulledAt: new Date().toISOString(),
  }];
}

export async function testConnection(credentials: GitHubCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch("https://api.github.com/user", { headers: authHeaders(credentials) });
    if (response.ok) {
      const data = await response.json() as { login: string };
      return { ok: true, message: `Connected to GitHub as ${data.login}` };
    }
    return { ok: false, message: `GitHub returned ${response.status}` };
  } catch (err) {
    return { ok: false, message: `Connection failed: ${String(err)}` };
  }
}

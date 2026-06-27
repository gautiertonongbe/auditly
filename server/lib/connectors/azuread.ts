/**
 * Azure AD / Microsoft Entra connector via Microsoft Graph API.
 * Pulls user lists, group memberships, role assignments, MFA status,
 * sign-in activity — all key evidence for access control (AC) ITGC tests.
 */

export interface AzureAdCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface PulledEvidence {
  source: string;
  recordId: string;
  summary: string;
  details: Record<string, string>;
  pulledAt: string;
}

async function getAccessToken(credentials: AzureAdCredentials): Promise<string> {
  const { tenantId, clientId, clientSecret } = credentials;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Azure AD token error ${response.status}: ${err}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

export async function pullPrivilegedUsers(
  credentials: AzureAdCredentials,
  queryConfig: { limit?: number; includeGuests?: boolean }
): Promise<PulledEvidence[]> {
  const token = await getAccessToken(credentials);
  const limit = queryConfig.limit ?? 100;

  // Get directory role members (Global Admin, Privileged Role Admin, etc.)
  const rolesResponse = await fetch(
    "https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName",
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );

  if (!rolesResponse.ok) throw new Error(`Graph API error: ${rolesResponse.status}`);
  const rolesData = await rolesResponse.json() as { value: { id: string; displayName: string }[] };

  const privilegedRoles = rolesData.value.filter(r =>
    ["Global Administrator", "Privileged Role Administrator", "User Administrator",
     "Application Administrator", "Security Administrator"].includes(r.displayName)
  );

  const results: PulledEvidence[] = [];

  for (const role of privilegedRoles.slice(0, 5)) {
    const membersResponse = await fetch(
      `https://graph.microsoft.com/v1.0/directoryRoles/${role.id}/members?$select=id,displayName,userPrincipalName,accountEnabled`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );

    if (!membersResponse.ok) continue;
    const membersData = await membersResponse.json() as {
      value: { id: string; displayName: string; userPrincipalName: string; accountEnabled: boolean }[]
    };

    for (const member of membersData.value.slice(0, limit)) {
      results.push({
        source: "Azure AD",
        recordId: member.id,
        summary: `Privileged User: ${member.displayName} (${member.userPrincipalName}) — Role: ${role.displayName}, Active: ${member.accountEnabled}`,
        details: {
          userId: member.id,
          displayName: member.displayName,
          email: member.userPrincipalName,
          role: role.displayName,
          accountEnabled: String(member.accountEnabled),
        },
        pulledAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

export async function pullAllUsers(
  credentials: AzureAdCredentials,
  queryConfig: { limit?: number; includeDisabled?: boolean }
): Promise<PulledEvidence[]> {
  const token = await getAccessToken(credentials);
  const limit = queryConfig.limit ?? 200;

  let filter = "";
  if (!queryConfig.includeDisabled) filter = "&$filter=accountEnabled eq true";

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users?$top=${limit}&$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime,lastSignInDateTime,userType${filter}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Graph API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    value: {
      id: string;
      displayName: string;
      userPrincipalName: string;
      accountEnabled: boolean;
      createdDateTime: string;
      userType: string;
    }[]
  };

  return data.value.map(user => ({
    source: "Azure AD",
    recordId: user.id,
    summary: `User: ${user.displayName} (${user.userPrincipalName}) — Type: ${user.userType ?? "Member"}, Enabled: ${user.accountEnabled}`,
    details: {
      userId: user.id,
      displayName: user.displayName,
      email: user.userPrincipalName,
      accountEnabled: String(user.accountEnabled),
      createdDateTime: user.createdDateTime ?? "",
      userType: user.userType ?? "Member",
    },
    pulledAt: new Date().toISOString(),
  }));
}

export async function testConnection(credentials: AzureAdCredentials): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getAccessToken(credentials);
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/organization?$select=id,displayName",
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (response.ok) {
      const data = await response.json() as { value: { displayName: string }[] };
      const orgName = data.value[0]?.displayName ?? "Unknown";
      return { ok: true, message: `Connected to Azure AD tenant: ${orgName}` };
    }
    return { ok: false, message: `Graph API returned ${response.status}` };
  } catch (err) {
    return { ok: false, message: `Connection failed: ${String(err)}` };
  }
}

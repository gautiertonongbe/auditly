import { useEffect } from "react";
import { useLocation } from "wouter";

/** Handles the redirect from /api/auth/sso/* — reads the JWT from the URL hash
 *  and stores it exactly like a normal login, then navigates to the dashboard. */
export default function SsoCallbackPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const hash = window.location.hash; // "#token=eyJ..."
    const tokenMatch = hash.match(/[#&]token=([^&]+)/);
    const errorMatch = new URLSearchParams(window.location.search).get("sso_error");

    if (errorMatch) {
      navigate(`/login?error=${encodeURIComponent(errorMatch)}`);
      return;
    }

    if (tokenMatch) {
      localStorage.setItem("auditly_token", tokenMatch[1]);
      // Clear the hash before navigating so the token isn't visible in history
      window.history.replaceState(null, "", window.location.pathname);
      navigate("/");
    } else {
      navigate("/login?error=SSO+authentication+failed");
    }
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #1E3A5F", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ fontSize: 14, color: "#6B7280" }}>Completing sign-in...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}

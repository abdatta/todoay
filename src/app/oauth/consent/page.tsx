"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckSquare2, ShieldCheck, X } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { getSupabaseClient } from "@/lib/supabase";

type AuthorizationDetails = {
  authorization_id: string;
  client: {
    id?: string;
    client_id?: string;
    name?: string;
    client_name?: string;
  };
  redirect_uri: string;
  scope?: string;
};

type AuthorizationRedirect = {
  redirect_url: string;
};

const isAuthorizationRedirect = (
  value: AuthorizationDetails | AuthorizationRedirect | null,
): value is AuthorizationRedirect =>
  Boolean(value && "redirect_url" in value && typeof value.redirect_url === "string");

const getClientName = (details: AuthorizationDetails) =>
  details.client.name ?? details.client.client_name ?? details.client.client_id ?? details.client.id ?? "ChatGPT";

function OAuthConsentScreen() {
  const searchParams = useSearchParams();
  const authorizationId = searchParams.get("authorization_id");
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopes = useMemo(
    () => details?.scope?.split(/\s+/).filter(Boolean) ?? [],
    [details],
  );

  useEffect(() => {
    let isActive = true;

    const loadAuthorization = async () => {
      await Promise.resolve();
      const client = getSupabaseClient();
      if (!isActive) {
        return;
      }

      if (!client) {
        setError("Supabase is not configured for Todoay.");
        setIsLoading(false);
        return;
      }

      if (!authorizationId) {
        setError("Missing OAuth authorization id.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (!isActive) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setIsLoading(false);
        return;
      }

      if (!sessionData.session) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      const { data, error: detailsError } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!isActive) {
        return;
      }

      if (detailsError) {
        setError(detailsError.message);
        setIsLoading(false);
        return;
      }

      if (isAuthorizationRedirect(data)) {
        window.location.href = data.redirect_url;
        return;
      }

      setDetails(data);
      setIsLoading(false);
    };

    void loadAuthorization();

    return () => {
      isActive = false;
    };
  }, [authorizationId]);

  const signIn = async () => {
    const client = getSupabaseClient();
    if (!client) {
      setError("Supabase is not configured for Todoay.");
      return;
    }

    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
      },
    });

    if (signInError) {
      setError(signInError.message);
    }
  };

  const decide = async (decision: "approve" | "deny") => {
    const client = getSupabaseClient();
    if (!client || !authorizationId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = decision === "approve"
      ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (response.error) {
      setError(response.error.message);
      setIsSubmitting(false);
      return;
    }

    window.location.href = response.data.redirect_url;
  };

  return (
    <div className="app-shell">
      <PageHeader
        title="Connect Todoay"
        icon={<ShieldCheck size={30} color="var(--accent-color)" />}
      />

      <section className="card settings-card">
        {isLoading ? (
          <div className="empty-state">Loading connection request...</div>
        ) : error ? (
          <div className="settings-status error">{error}</div>
        ) : !isAuthenticated ? (
          <div className="settings-row settings-row-stack">
            <span className="settings-row-text">
              <span className="settings-row-label">
                <CheckSquare2 size={18} color="var(--accent-color)" />
                <span>Sign in to Todoay</span>
              </span>
              <span className="settings-row-description">
                Sign in with the Todoay account you want ChatGPT to access.
              </span>
            </span>
            <button type="button" className="primary-button" onClick={() => void signIn()}>
              Sign in
            </button>
          </div>
        ) : details ? (
          <>
            <div className="settings-row settings-row-stack">
              <span className="settings-row-text">
                <span className="settings-row-label">
                  <ShieldCheck size={18} color="var(--accent-color)" />
                  <span>Allow {getClientName(details)} to read Todoay?</span>
                </span>
                <span className="settings-row-description">
                  This connection can read your synced tasks, notes, threads, backlog, and cloud history through the Todoay MCP server.
                </span>
              </span>
            </div>

            <div className="settings-divider" />

            <div className="settings-row settings-row-stack">
              <span className="settings-row-text">
                <span className="settings-row-label">Connection details</span>
                <span className="settings-row-description">
                  Redirect URI: {details.redirect_uri}
                </span>
                {scopes.length > 0 ? (
                  <span className="settings-row-description">
                    Requested scopes: {scopes.join(", ")}
                  </span>
                ) : null}
              </span>
            </div>

            <div className="settings-divider" />

            <div className="settings-modal-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={isSubmitting}
                onClick={() => void decide("deny")}
              >
                <X size={16} />
                Deny
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={isSubmitting}
                onClick={() => void decide("approve")}
              >
                Approve
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export default function OAuthConsentPage() {
  return (
    <ClientReady>
      <Suspense fallback={<div className="loading-screen">Loading Todoay...</div>}>
        <OAuthConsentScreen />
      </Suspense>
    </ClientReady>
  );
}

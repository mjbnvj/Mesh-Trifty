const SESSION_KEY = "meshtrifty.supabase-session.v1";
const RECOVERY_TOKEN_KEY = "meshtrifty.password-recovery-token.v1";
let configPromise;
let session = null;
let recoveryToken = readRecoveryToken();
const listeners = new Set();

function readRecoveryToken() {
  try {
    return sessionStorage.getItem(RECOVERY_TOKEN_KEY);
  } catch (error) {
    console.error("Could not restore the password recovery session.", error);
    return null;
  }
}

function emit() {
  listeners.forEach(listener => listener(session?.user || null));
}

function saveSession(value) {
  session = value?.access_token && value?.refresh_token
    ? {
        access_token: value.access_token,
        refresh_token: value.refresh_token,
        expires_at: Number(value.expires_at || (Date.now() / 1000 + Number(value.expires_in || 3600))),
        user: value.user || null
      }
    : null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Could not save the sign-in session in this browser.", error);
  }
  emit();
}

function readStoredSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.access_token || !parsed?.refresh_token || !Number.isFinite(Number(parsed.expires_at))) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Could not read the saved sign-in session.", error);
    return null;
  }
}

export async function getConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/config", { headers: { "Accept": "application/json" } })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "The store backend is unavailable.");
        if (!result.supabaseUrl || !result.supabaseAnonKey) throw new Error("The store backend is not configured.");
        return result;
      });
  }
  return configPromise;
}

async function authRequest(path, { method = "POST", body, token } = {}) {
  const config = await getConfig();
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method,
    headers: {
      "apikey": config.supabaseAnonKey,
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || result.error || "The account request could not be completed.");
  return result;
}

function takeAuthTokensFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return;
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");
  const expiresIn = Number(params.get("expires_in") || 3600);
  if (type === "recovery") {
    recoveryToken = accessToken;
    try {
      sessionStorage.setItem(RECOVERY_TOKEN_KEY, accessToken);
    } catch (error) {
      console.error("Could not preserve the password recovery session.", error);
    }
  }
  if (refreshToken) {
    saveSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn
    });
  }
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

export async function initializeAuth() {
  takeAuthTokensFromUrl();
  if (!session) session = readStoredSession();
  if (!session) {
    emit();
    return null;
  }

  try {
    if (session.expires_at <= Date.now() / 1000 + 30) {
      const refreshed = await authRequest("token?grant_type=refresh_token", {
        body: { refresh_token: session.refresh_token }
      });
      saveSession(refreshed);
    } else {
      const user = await authRequest("user", { method: "GET", token: session.access_token });
      session = { ...session, user };
      saveSession(session);
    }
  } catch (error) {
    console.error("The saved MESHTRIFTY session could not be restored.", error);
    saveSession(null);
  }
  return session?.user || null;
}

export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentUser() {
  return session?.user || null;
}

export function isPasswordRecovery() {
  return Boolean(recoveryToken);
}

export async function accessToken() {
  if (!session) throw new Error("Sign in to continue.");
  if (session.expires_at <= Date.now() / 1000 + 30) {
    const refreshed = await authRequest("token?grant_type=refresh_token", {
      body: { refresh_token: session.refresh_token }
    });
    saveSession(refreshed);
  }
  return session.access_token;
}

export async function signUp({ name, email, password }) {
  const redirectTo = new URL("./index.html", location.href).href;
  const result = await authRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    body: { email, password, data: { full_name: name } }
  });
  if (result.access_token) saveSession(result);
  return { user: result.user || null, needsEmailConfirmation: !result.access_token };
}

export async function signIn(email, password) {
  const result = await authRequest("token?grant_type=password", {
    body: { email, password }
  });
  saveSession(result);
  return result.user;
}

export async function signOut() {
  if (session?.access_token) {
    await authRequest("logout", { token: await accessToken() });
  }
  saveSession(null);
}

export async function requestPasswordReset(email) {
  const redirectTo = new URL("./index.html", location.href).href;
  await authRequest(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    body: { email }
  });
}

export async function updateRecoveredPassword(password) {
  if (!recoveryToken) throw new Error("Open the password reset link from your email first.");
  await authRequest("user", {
    method: "PUT",
    token: recoveryToken,
    body: { password }
  });
  recoveryToken = null;
  try {
    sessionStorage.removeItem(RECOVERY_TOKEN_KEY);
  } catch (error) {
    console.error("Could not clear the password recovery session.", error);
  }
  saveSession(null);
}

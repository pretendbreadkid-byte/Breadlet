"use client";

import { FormEvent, useState } from "react";

// The page a password reset email links to. The link's #hash carries a short-lived sign-in token
// (type=recovery); the player picks a new password and then logs in with it as usual.
export function recoveryTokenFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("type") !== "recovery" || !params.get("access_token")) return null;
  return params.get("access_token");
}

export function recoveryErrorFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  if (!query.has("reset") && !hash.has("error_code")) return null;
  const error = hash.get("error_description") || query.get("error_description");
  return error ? `${error.replace(/\+/g, " ")}. Ask for a new reset link.` : null;
}

export function ResetPasswordScreen({ accessToken, onDone }: { accessToken: string; onDone: (message: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 6) return setError("Use a password with at least 6 characters.");
    if (password !== confirm) return setError("The passwords don't match.");
    setSaving(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, password }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok) return setError(body?.error || "Couldn't change your password. Try again.");
    onDone(`Password changed${body?.username ? ` for ${body.username}` : ""}. Log in with your new password.`);
  };

  return (
    <main className="auth-screen relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0c3b70] px-5 text-white">
      <form onSubmit={submit} className="auth-card w-full max-w-md">
        <img src="/assets/breadlet-logo-2.svg" alt="Breadlet" className="auth-logo" />
        <h1 className="text-center text-3xl font-black">Choose a new password</h1>
        <label htmlFor="new-password" className="mt-8 block text-xs font-bold uppercase tracking-widest text-[#eac477]">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]" />
        <label htmlFor="confirm-password" className="mt-4 block text-xs font-bold uppercase tracking-widest text-[#eac477]">Type it again</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]" />
        {error && <p role="alert" className="mt-3 text-center text-sm font-bold text-red-300">{error}</p>}
        <button type="submit" disabled={saving} className="auth-primary mt-6 w-full rounded-xl px-4 py-3 font-black disabled:opacity-60">{saving ? "Saving..." : "Save new password"}</button>
      </form>
    </main>
  );
}

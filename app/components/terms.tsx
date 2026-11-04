"use client";

import { useState } from "react";
import { TERMS_SECTIONS } from "../../lib/terms";

function TermsText() {
  return (
    <div className="terms-text">
      {TERMS_SECTIONS.map((section) => <section key={section.title}><h3>{section.title}</h3><p>{section.text}</p></section>)}
    </div>
  );
}

// Opened from the signup form.
export function TermsModal({ close }: { close: () => void }) {
  return (
    <div className="modal-layer terms-layer fixed inset-0 flex items-center justify-center bg-black/80 px-5">
      <div className="terms-card" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <h2 id="terms-title">Terms of Service</h2>
        <TermsText />
        <button type="button" onClick={close} className="terms-agree">Close</button>
      </div>
    </div>
  );
}

// Blocks the game until the player agrees to the current terms.
export function TermsGate({ onAccept, onDecline }: { onAccept: () => Promise<boolean>; onDecline: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = async () => {
    setBusy(true);
    setFailed(false);
    const saved = await onAccept();
    setBusy(false);
    setFailed(!saved);
  };

  return (
    <div className="modal-layer terms-layer fixed inset-0 flex items-center justify-center bg-black/80 px-5">
      <div className="terms-card" role="dialog" aria-modal="true" aria-labelledby="terms-title">
        <h2 id="terms-title">Terms of Service</h2>
        <p className="terms-intro">Please read and agree to keep playing Breadlet.</p>
        <TermsText />
        <label className="terms-check">
          <input type="checkbox" checked={checked} onChange={(change) => setChecked(change.target.checked)} />
          I am 13 or older and agree to the Terms of Service
        </label>
        {failed && <p role="alert" className="terms-error">That didn't save. Please try again.</p>}
        <button type="button" disabled={!checked || busy} onClick={() => void accept()} className="terms-agree">{busy ? "Saving…" : "Agree and play"}</button>
        <button type="button" onClick={onDecline} className="terms-decline">Leave</button>
      </div>
    </div>
  );
}

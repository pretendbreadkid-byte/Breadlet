"use client";

// A custom ban screen in the style of a Star Wars opening crawl. The crimes come from the banned
// player's profile (lib/ban-screen.ts). A banned player has no way out of it; an admin previewing
// one (onClose) gets a close button.
import { createPortal } from "react-dom";
import type { BanScreen } from "../../lib/ban-screen";

export function BanCrawl({ screen, onClose }: { screen: BanScreen; onClose?: () => void }) {
  const crawl = (
    <div className="ban-crawl" role="alertdialog" aria-modal="true" aria-labelledby="ban-crawl-title">
      <p className="ban-crawl-intro">A long time ago, in a Breadlet far, far away....</p>
      <h1 id="ban-crawl-title" className="ban-crawl-logo">BANNED</h1>
      <div className="ban-crawl-stage">
        <div className="ban-crawl-text">
          <p className="ban-crawl-episode">Episode ∞</p>
          <h2>{screen.title}</h2>
          <p>It is a dark time for the Breadlet galaxy. After a long investigation, the admins have uncovered the following crimes:</p>
          <ul>
            {screen.crimes.map((crime) => <li key={crime}>{crime}</li>)}
          </ul>
          <p>For these crimes, every account, device and network connected to this player has been banished from the Breadlet galaxy.</p>
          <p>Forever.</p>
        </div>
      </div>
      {onClose && <button type="button" onClick={onClose} className="ban-crawl-close">Close preview</button>}
    </div>
  );
  // A preview opens inside the game; on the page body it isn't recoloured by the game's theme.
  return onClose ? createPortal(crawl, document.body) : crawl;
}

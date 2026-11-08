"use client";

// A custom ban screen in the style of a Star Wars opening crawl. The crimes come from the banned
// player's profile (lib/ban-screen.ts). There's no way out of it: the account can't play.
import type { BanScreen } from "../../lib/ban-screen";

export function BanCrawl({ screen }: { screen: BanScreen }) {
  return (
    <div className="ban-crawl" role="alertdialog" aria-modal="true" aria-labelledby="ban-crawl-title">
      <p className="ban-crawl-intro">A long time ago, in a Breadlet far, far away....</p>
      <h1 id="ban-crawl-title" className="ban-crawl-logo">BANNED</h1>
      <div className="ban-crawl-stage" aria-hidden="false">
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
    </div>
  );
}

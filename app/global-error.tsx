"use client";

import { UpdateScreen } from "./update-screen";

// Catches crashes in the root layout itself, so it has to render its own <html> and <body>.
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <UpdateScreen />
      </body>
    </html>
  );
}

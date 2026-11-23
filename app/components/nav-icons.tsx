// Menu icons. Most are solid shapes; the Goodybag is an outlined bag with a handle, like the bags
// in Ted's Shop. They take their colour from the text (currentColor).
type IconProps = { size?: number };
const box = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const, focusable: false as const });

export function GoodybagIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.2 8.5V7a3.8 3.8 0 0 1 7.6 0v1.5" />
      <path d="M5.5 8.5h13a1 1 0 0 1 1 1.06l-.7 10.1a2 2 0 0 1-2 1.84H7.2a2 2 0 0 1-2-1.84l-.7-10.1a1 1 0 0 1 1-1.06Z" />
      <path d="M9.5 13.5a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

// A slice of bread with a little face (a Breadlet), the eyes cut out of the shape.
export function BreadletIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor" fillRule="evenodd">
      <path d="M7.5 2.8h9a4.7 4.7 0 0 1 2.2 8.85V19.8A1.7 1.7 0 0 1 17 21.5H7a1.7 1.7 0 0 1-1.7-1.7v-8.15A4.7 4.7 0 0 1 7.5 2.8ZM9.6 12.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4.8 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm-4.3 4.6a.8.8 0 0 0-.5 1.4 3.6 3.6 0 0 0 4.8 0 .8.8 0 1 0-1.1-1.2 2 2 0 0 1-2.6 0 .8.8 0 0 0-.6-.2Z" />
    </svg>
  );
}

export function ClanIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor">
      <path d="M11.4 2.2a1.6 1.6 0 0 1 1.2 0l6.6 2.6a1.5 1.5 0 0 1 .95 1.4v5.3c0 4.9-3.2 8.9-7.6 10.3a1.7 1.7 0 0 1-1.1 0C7.05 20.4 3.85 16.4 3.85 11.5V6.2a1.5 1.5 0 0 1 .95-1.4Z" />
    </svg>
  );
}

export function BazaarIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor">
      <path d="M4.9 3.5h14.2a1.5 1.5 0 0 1 1.4 1l1.3 3.9a3.1 3.1 0 0 1-5.3 3 3.1 3.1 0 0 1-4.5.05 3.1 3.1 0 0 1-4.5-.05 3.1 3.1 0 0 1-5.3-3l1.3-3.9a1.5 1.5 0 0 1 1.4-1Z" />
      <path d="M4.6 13.4a4.6 4.6 0 0 0 3.65-.5 4.6 4.6 0 0 0 3.75.6 4.6 4.6 0 0 0 3.75-.6 4.6 4.6 0 0 0 3.65.5V20a1.5 1.5 0 0 1-1.5 1.5h-3.4v-4.3a.9.9 0 0 0-.9-.9h-3.2a.9.9 0 0 0-.9.9v4.3H6.1A1.5 1.5 0 0 1 4.6 20Z" />
    </svg>
  );
}

export function ChatIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor">
      <path d="M12 3C6.75 3 2.75 6.55 2.75 11c0 2.35 1.12 4.45 2.95 5.9l-.85 3.35a.75.75 0 0 0 1.07.85l3.75-1.9c.75.15 1.5.22 2.33.22 5.25 0 9.25-3.55 9.25-8.42C21.25 6.55 17.25 3 12 3Z" />
    </svg>
  );
}

export function TrophyIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor" fillRule="evenodd">
      <path d="M7.2 2.8h9.6a.9.9 0 0 1 .9.9v.6h2.4a.9.9 0 0 1 .9.9v1.6a4.2 4.2 0 0 1-3.9 4.2 5.6 5.6 0 0 1-4 3.4v2.7h2.6a1 1 0 0 1 1 1v2.4a.9.9 0 0 1-.9.9H8.2a.9.9 0 0 1-.9-.9v-2.4a1 1 0 0 1 1-1h2.6v-2.7a5.6 5.6 0 0 1-4-3.4 4.2 4.2 0 0 1-3.9-4.2V5.2a.9.9 0 0 1 .9-.9h2.4v-.6a.9.9 0 0 1 .9-.9ZM4.8 6.1v.7a2.4 2.4 0 0 0 1.6 2.25 7 7 0 0 1-.1-1.05V6.1Zm14.4 0h-1.5V8a7 7 0 0 1-.1 1.05 2.4 2.4 0 0 0 1.6-2.25Z" />
    </svg>
  );
}

// Beta look (Settings > Layout) icons: crossed swords for Clans, a gavel for the Bazaar and a
// suitcase for Breadlets.
export function SwordsIcon({ size = 20 }: IconProps) {
  // One sword pointing up, drawn twice and turned each way so they cross.
  const sword = <><path d="M12 1.2 14 4v11h-4V4Z" /><rect x="7" y="15" width="10" height="2.3" rx="1.1" /><rect x="10.9" y="17" width="2.2" height="4" /><circle cx="12" cy="21.8" r="1.6" /></>;
  return (
    <svg {...box(size)} fill="currentColor">
      <g transform="rotate(-45 12 12) translate(0 .4) scale(.94) translate(.75 .75)">{sword}</g>
      <g transform="rotate(45 12 12) translate(0 .4) scale(.94) translate(.75 .75)">{sword}</g>
    </svg>
  );
}

export function GavelIcon({ size = 20 }: IconProps) {
  // A gavel: the head across the top and the handle going down, tipped over to the left.
  return (
    <svg {...box(size)} fill="currentColor">
      <g transform="rotate(45 12 12)">
        <rect x="5.5" y="2.5" width="13" height="7" rx="1.6" />
        <rect x="4" y="1.5" width="3" height="9" rx="1.2" />
        <rect x="17" y="1.5" width="3" height="9" rx="1.2" />
        <rect x="10.6" y="9" width="2.8" height="13.5" rx="1.4" />
      </g>
    </svg>
  );
}

export function SuitcaseIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor" fillRule="evenodd">
      <path d="M9 2.5h6A2.5 2.5 0 0 1 17.5 5v1.5H19A2.5 2.5 0 0 1 21.5 9v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 19V9A2.5 2.5 0 0 1 5 6.5h1.5V5A2.5 2.5 0 0 1 9 2.5Zm0 2a.5.5 0 0 0-.5.5v1.5h7V5a.5.5 0 0 0-.5-.5ZM7 9v10.5h1.8V9Zm8.2 0v10.5H17V9Z" />
    </svg>
  );
}

// Icons made from your pictures (public/assets/icons, white shapes).
// zoom: the pictures have empty space around the shape, so they're enlarged to match the others.
function PictureIcon({ src, size, zoom }: { src: string; size: number; zoom: number }) {
  return <img src={src} alt="" aria-hidden="true" draggable={false} className="picture-icon" style={{ width: size, height: size, transform: `scale(${zoom})` }} />;
}
export function GoodybagsPictureIcon({ size = 20 }: IconProps) {
  return <PictureIcon src="/assets/icons/goodybags.svg" size={size} zoom={1.3} />;
}
export function BreadletsPictureIcon({ size = 20 }: IconProps) {
  return <PictureIcon src="/assets/icons/breadlets.svg" size={size} zoom={1.65} />;
}
// The Event tab: a star with rounded points.
export function RoundStarIcon({ size = 20 }: IconProps) {
  return (
    <svg {...box(size)} fill="currentColor" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
      <path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.35 1.05 6.12L12 16.87l-5.5 2.9 1.05-6.12L3.1 9.3l6.15-.9Z" />
    </svg>
  );
}

import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Breadlet',
  description: 'Breadlet collectible game architecture and landing foundation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

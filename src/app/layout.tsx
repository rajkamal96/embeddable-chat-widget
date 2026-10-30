import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Embeddable AI chat widget (demo)',
  description:
    'A demo of an embeddable chat widget that answers only from a business’s own content, with source links and honest refusals.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

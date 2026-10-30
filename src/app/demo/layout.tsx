import Link from 'next/link';
import type { ReactNode } from 'react';

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="banner">
        Demo: Acme Dental is a fictional business. The chat button (bottom right) is the widget being demonstrated.{' '}
        <Link href="/embed">How to install it</Link>
      </div>
      <div className="wrap">
        <nav className="site-nav" aria-label="Acme Dental">
          <Link className="brand" href="/demo">Acme Dental</Link>
          <Link href="/demo/services">Services</Link>
          <Link href="/demo/pricing">Pricing</Link>
          <Link href="/demo/hours-location">Hours</Link>
          <Link href="/demo/new-patients">New patients</Link>
          <Link href="/demo/insurance-payment">Insurance</Link>
          <Link href="/demo/faq">FAQ</Link>
          <Link href="/demo/team">Team</Link>
        </nav>
        <main className="content">{children}</main>
      </div>
      {/* The one-line install a real customer would paste into their own site. */}
      <script src="/widget.js" data-site="acme-dental" async />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] });

export const metadata: Metadata = { title: 'Support Triage (demo)', description: 'Agent-assisted support inbox with human approval' };

const NAV = 'rounded px-2 py-1 text-sm underline-offset-4 hover:underline';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <div role="note" className="bg-amber-200 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
          Demo: synthetic data, mock inbox, mock send. Nothing is delivered to real customers.
        </div>
        <header className="flex flex-wrap items-baseline gap-x-8 gap-y-1 border-b-2 border-ink px-4 py-3">
          <span className="font-display text-xl font-semibold tracking-tight">Support Triage</span>
          <nav aria-label="Main" className="flex gap-2">
            <Link className={NAV} href="/">Inbox</Link>
            <Link className={NAV} href="/metrics">Metrics</Link>
            <Link className={NAV} href="/diagnostics">Diagnostics</Link>
          </nav>
        </header>
        <main className="p-4">{children}</main>
      </body>
    </html>
  );
}

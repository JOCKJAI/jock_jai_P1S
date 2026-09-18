import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'COINPRINT LAB — 3D Print Queue',
  description: 'Pick a coin, leave your name, and join the 3D printing queue.',
  metadataBase: new URL('https://jock-jai-p1s.mokyeung08.workers.dev'),
  openGraph: {
    title: 'COINPRINT LAB — 3D Print Queue',
    description: 'Pick a coin, leave your name, and join the 3D printing queue.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'COINPRINT LAB — 3D Print Queue',
    description: 'Pick a coin, leave your name, and join the 3D printing queue.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

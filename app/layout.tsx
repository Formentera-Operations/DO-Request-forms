import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Void Checks',
  description: 'Void check request management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

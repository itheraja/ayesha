import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Ayesha — A little more human. | Academic Demo',
  description:
    'A bilingual AI voice receptionist. An unofficial Dr. Ziauddin Hospital academic demonstration with synthetic appointments.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import './globals.css';
import ClientLayout from './client-layout';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

export const metadata = {
  title: 'CNI — Codebase Neural Interface',
  description: 'Explore and query any codebase with interactive dependency graphs, LLM chat, and health dashboards. 100% local.',
};

export { GeistMono };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

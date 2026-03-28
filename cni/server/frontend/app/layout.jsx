import './globals.css';
import ClientLayout from './client-layout';

export const metadata = {
  title: 'CNI — Codebase Neural Interface',
  description: 'Explore and query any codebase with interactive dependency graphs, LLM chat, and health dashboards. 100% local.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}

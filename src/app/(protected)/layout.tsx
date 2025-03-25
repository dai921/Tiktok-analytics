import { Sidebar } from '@/components/sidebar/sidebar';

export default function ProtectedLayout({ children }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-4 overflow-auto">{children}</main>
    </div>
  );
}

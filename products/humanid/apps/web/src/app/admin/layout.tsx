import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Dashboard — HumanID" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manage Issuers — HumanID Admin" };

export default function AdminIssuersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

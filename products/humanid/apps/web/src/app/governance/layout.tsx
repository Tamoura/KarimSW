import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Governance — HumanID",
};

export default function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

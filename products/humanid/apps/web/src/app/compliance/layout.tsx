import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance — HumanID",
};

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

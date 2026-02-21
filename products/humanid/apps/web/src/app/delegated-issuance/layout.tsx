import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delegated Issuance — HumanID",
};

export default function UdelegatedUissuanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

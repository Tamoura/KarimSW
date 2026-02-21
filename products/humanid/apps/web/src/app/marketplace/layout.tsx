import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Credential Marketplace — HumanID",
};

export default function UmarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Issuer — HumanID",
};

export default function IssuerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

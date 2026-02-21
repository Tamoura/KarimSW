import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organization — HumanID",
};

export default function OrgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

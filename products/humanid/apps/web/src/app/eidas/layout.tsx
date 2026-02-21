import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "eIDAS Compliance — HumanID",
};

export default function UeidasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

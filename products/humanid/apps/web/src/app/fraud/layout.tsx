import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fraud Detection — HumanID",
};

export default function UfraudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regional Configuration — HumanID",
};

export default function UregionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

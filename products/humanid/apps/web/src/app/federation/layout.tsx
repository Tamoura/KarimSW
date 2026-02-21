import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Federation — HumanID",
};

export default function UfederationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

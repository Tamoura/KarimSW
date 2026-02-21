import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account — HumanID",
};

export default function UregisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security — HumanID",
};

export default function UsecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

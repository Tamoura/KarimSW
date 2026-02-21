import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developer Portal — HumanID",
};

export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

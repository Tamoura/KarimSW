import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agents — HumanID",
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

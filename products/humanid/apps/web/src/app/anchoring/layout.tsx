import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blockchain Anchoring — HumanID",
};

export default function UanchoringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

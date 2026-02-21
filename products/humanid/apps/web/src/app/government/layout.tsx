import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Government Services — HumanID",
};

export default function UgovernmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

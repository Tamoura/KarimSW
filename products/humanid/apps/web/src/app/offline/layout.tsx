import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline Mode — HumanID",
};

export default function UofflineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

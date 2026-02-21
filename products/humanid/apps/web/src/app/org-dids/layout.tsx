import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organization DIDs — HumanID",
};

export default function UorgUdidsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

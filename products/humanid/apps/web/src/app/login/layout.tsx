import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — HumanID",
};

export default function UloginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

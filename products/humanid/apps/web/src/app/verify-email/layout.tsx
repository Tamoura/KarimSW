import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Email — HumanID",
};

export default function UverifyUemailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

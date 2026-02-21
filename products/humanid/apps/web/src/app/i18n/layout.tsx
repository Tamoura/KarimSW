import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Localization — HumanID",
};

export default function Ui18nLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

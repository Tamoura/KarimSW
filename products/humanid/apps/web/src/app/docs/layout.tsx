import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation — HumanID",
  description:
    "HumanID documentation for consumers, developers, and organisations. Learn how to create your wallet, integrate with the API, and issue verifiable credentials.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

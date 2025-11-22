import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { WorkspaceAuroraWrapper } from "@/components/layout/WorkspaceAuroraWrapper";

export default function Layout({
  children,
}: {
  children: React.ReactNode,
  params: { locale: string }
}) {

  return (
    <div className="relative overflow-hidden min-h-screen">
      <WorkspaceAuroraWrapper />

      <Header path={[]} className="relative z-10" />
      <main className="min-h-[70vh] relative z-5">
        {children}
      </main>
      <Footer className="relative z-5" />
    </div>
  );
}


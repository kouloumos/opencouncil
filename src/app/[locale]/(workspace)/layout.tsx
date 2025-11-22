import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { getRealm } from "@/lib/realm.server";

export default async function Layout({
  children,
}: {
  children: React.ReactNode,
}) {
  const realm = await getRealm();

  return (
    <div className="min-h-screen">
      <Header path={[]} />
      <main id="main-content" className="min-h-[70vh]">
        {children}
      </main>
      <Footer realm={realm} />
    </div>
  );
}

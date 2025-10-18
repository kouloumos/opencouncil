import React from "react"
import { LandingScrollLock } from "@/components/landing/v2/LandingScrollLock";
import Header from "@/components/layout/Header"
import { env } from "@/env.mjs"

export default function LandingImmersiveLayout({
    children,
}: {
    children: React.ReactNode,
}) {
    // The generic landing page scrolls, under the site header.
    if (env.NEXT_PUBLIC_APP_MODE === 'generic') {
        return (
            <div className="min-h-screen">
                <Header path={[]} />
                <main id="main-content">{children}</main>
            </div>
        );
    }

    return (
        <>
            <LandingScrollLock />
            {children}
        </>
    );
}

import "./globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../lib/utils"
import React from "react"
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toaster";
import { routing } from "@/i18n/routing";

// Keep Inter as a fallback font
const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

export const metadata = {
    title: 'OpenTranscripts',
    description: 'Ανοιχτή απομαγνητοφώνηση',
    icons: {
        icon: '/favicon.ico',
    },
    metadataBase: new URL('https://opencouncil.gr'),
    openGraph: {
        title: 'OpenTranscripts',
        description: 'Ανοιχτή απομαγνητοφώνηση',
        type: 'website',
        url: 'https://opencouncil.gr',
        images: [
            {
                url: '/logo.png',
                width: 500,
                height: 500,
                alt: 'OpenTranscripts Logo',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'OpenTranscripts',
        description: 'Ανοιχτή απομαγνητοφώνηση',
        images: ['/logo.png'],
    },
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
    children,
    params: { locale }
}: {
    children: React.ReactNode,
    params: { locale: string }
}) {

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
            </head>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                <SessionProvider>
                    <PlausibleProvider domain="opencouncil.gr">
                        {children}
                        <Toaster />
                    </PlausibleProvider>
                </SessionProvider>
            </body>
        </html>
    );
}

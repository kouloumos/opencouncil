import { SignIn } from "@/components/user/sign-in"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/db/prisma"

export default async function SignInPage({
    searchParams
}: {
    searchParams: { token?: string; email?: string; callbackUrl?: string }
}) {
    const session = await auth()
    
    // If already signed in, redirect to callback or profile
    if (session) {
        redirect(searchParams.callbackUrl || "/profile")
    }

    // Handle token-based sign-in (from invitation emails)
    if (searchParams.token && searchParams.email) {
        const verificationToken = await prisma.verificationToken.findUnique({
            where: {
                identifier_token: {
                    identifier: searchParams.email,
                    token: searchParams.token
                }
            }
        })

        // Check if token is valid and not expired
        if (verificationToken && verificationToken.expires > new Date()) {
            // Build the NextAuth callback URL to complete sign-in
            const callbackUrl = searchParams.callbackUrl || "/workspaces"
            const authCallbackUrl = `/api/auth/callback/resend?token=${searchParams.token}&email=${encodeURIComponent(searchParams.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`
            
            redirect(authCallbackUrl)
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
            <SignIn />
        </div>
    )
}

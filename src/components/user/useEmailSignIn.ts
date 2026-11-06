"use client"
import { useState } from "react"
import posthog from "posthog-js"
import { signInWithEmail } from "@/lib/serverSignIn"

/**
 * The email (magic link) sign-in, for any form that asks for an address: the
 * sign-in card and the OpenTranscripts landing page. The form carries an
 * `email` field and, optionally, a hidden `callbackUrl`. `error` is a key in
 * the SignIn message namespace.
 */
export function useEmailSignIn({ callbackUrl, initialError = null }: { callbackUrl: string | null; initialError?: string | null }) {
    const [error, setError] = useState<string | null>(initialError)
    const [isLoading, setIsLoading] = useState(false)
    const [sentTo, setSentTo] = useState<string | null>(null)

    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)

        posthog.capture("sign_in_requested", { method: "email", has_callback_url: !!callbackUrl })

        try {
            await signInWithEmail(formData)
            // The email is sent. Confirm it here rather than on Auth.js's
            // built-in verify-request page, which is unstyled, untranslated
            // and outside the site layout.
            setSentTo(String(formData.get("email") ?? ""))
        } catch (err) {
            posthog.captureException(err)
            setError("error")
            console.error("Sign in error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    return { submit, error, setError, isLoading, sentTo, setSentTo }
}

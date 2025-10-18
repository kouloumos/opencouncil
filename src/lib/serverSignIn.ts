"use server"

import { signIn } from "@/auth"

export async function signInWithEmail(formData: FormData) {
    const email = formData.get("email")
    const callbackUrl = formData.get("callbackUrl") || "/profile"
    console.log(`Signing in with email: ${email}`)
    await signIn("resend", { email }, { redirectTo: callbackUrl as string })
}
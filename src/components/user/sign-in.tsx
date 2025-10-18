"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { useSearchParams } from "next/navigation"
import { signInWithEmail } from "@/lib/serverSignIn"
import { useState } from "react"
import { env } from "@/env.mjs"

export function SignIn() {
    const searchParams = useSearchParams()
    const email = searchParams.get("email")
    const callbackUrl = searchParams.get("callbackUrl")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const formData = new FormData(e.currentTarget)
            // Add callback URL to form data if present
            if (callbackUrl) {
                formData.append("callbackUrl", callbackUrl)
            }
            await signInWithEmail(formData)
        } catch (err) {
            setError("Υπήρξε πρόβλημα κατά την αποστολή του email. Παρακαλώ δοκιμάστε ξανά αργότερα.")
            console.error("Sign in error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const appName = env.NEXT_PUBLIC_APP_MODE === 'generic' ? 'OpenTranscripts' : 'OpenCouncil';

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h2 className="text-2xl font-semibold text-center">Σύνδεση στο {appName}</h2>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            type="email"
                            name="email"
                            placeholder="Εισάγετε το email σας"
                            className="w-full"
                            required
                            defaultValue={email || ""}
                            disabled={isLoading}
                        />
                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
                        )}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Παρακαλώ περιμένετε..." : "Συνέχεια με Email"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}
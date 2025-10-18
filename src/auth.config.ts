import Resend from "next-auth/providers/resend"
import type { NextAuthConfig } from "next-auth"
import { AuthEmail } from "./lib/email/templates/AuthEmail"
import { renderReactEmailToHtml } from "./lib/email/render"
import { env } from "./env.mjs"

// Determine app name and sender based on mode
const isGenericMode = env.NEXT_PUBLIC_APP_MODE === 'generic'
const appName = isGenericMode ? 'OpenTranscripts' : 'OpenCouncil'
const senderEmail = 'auth@opencouncil.gr'

export default {
    trustHost: true,
    providers: [Resend({
        from: `${appName} <${senderEmail}>`,
        apiKey: env.RESEND_API_KEY,
        sendVerificationRequest: async (params) => {
            const { identifier: to, provider, url, theme } = params
            const html = await renderReactEmailToHtml(AuthEmail({ url, appName }))

            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${provider.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: provider.from,
                    to,
                    subject: `Συνδεθείτε στο ${appName}`,
                    html,
                    text: `Συνδεθείτε στο ${appName}: ${url}`,
                }),
            })

            if (!res.ok)
                throw new Error("Resend error: " + JSON.stringify(await res.json()))
        }
    })],
} satisfies NextAuthConfig

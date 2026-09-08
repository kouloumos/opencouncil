import { randomBytes } from "crypto"
import { render } from "@react-email/render"
import { UserInviteEmail } from "@/lib/email/templates/user-invite"
import { sendEmail } from "@/lib/email/resend"
import { env } from "@/env.mjs"
import prisma from "@/lib/db/prisma"
import { getCityRealm } from "@/lib/db/cityRealm"
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl"
import type { Realm } from "@prisma/client"
import { signInUrlForRequest } from "@/lib/auth/signInUrl"

/**
 * The realm the invited person will actually use: the realm of the first city
 * they administer. Null when they administer no city (a superadmin, or a
 * party- or person-scoped admin), where there is no city to derive one from.
 */
async function realmForInvitee(cityIds: readonly (string | null | undefined)[]): Promise<Realm | null> {
    const cityId = cityIds.find((id): id is string => Boolean(id));
    return cityId ? getCityRealm(cityId) : null;
}

/**
 * Sign-in link for an invited person, on the domain they will actually use.
 *
 * `NEXTAUTH_URL` names one host for every realm, and production session cookies
 * are host-only, so an invite that lands on the wrong domain leaves the person
 * signed out where their city lives. The invited city's realm decides the
 * domain when there is one — that is the realm they will use, which is not
 * necessarily the one the inviting admin happens to be browsing.
 *
 * With no city to derive from, the admin's own host is the best available
 * signal, via `signInUrlForRequest` — which trusts only a host
 * `isKnownRealmHost` recognises, so a spoofed Host cannot move the link. Omit
 * both and the link keeps the configured host, as before.
 */
export async function generateSignInLink(
    email: string,
    { request, cityIds = [] }: { request?: Request; cityIds?: readonly (string | null | undefined)[] } = {},
): Promise<{ signInUrl: string, verificationTokenKey: { identifier: string, token: string } }> {
    const token = randomBytes(32).toString('hex')

    await prisma.verificationToken.create({
        data: {
            identifier: email,
            token,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    })

    const realm = await realmForInvitee(cityIds)
    const base = realm ? realmBaseUrl(realm) : env.NEXTAUTH_URL
    const configuredUrl = `${base}/sign-in?token=${token}&email=${encodeURIComponent(email)}`
    const signInUrl = realm || !request ? configuredUrl : signInUrlForRequest(configuredUrl, request)
    return {
        signInUrl,
        verificationTokenKey: {
            identifier: email,
            token,
        }
    }
}

export async function sendInviteEmail(
    email: string,
    name: string | null | undefined,
    options: { request?: Request; cityIds?: readonly (string | null | undefined)[] } = {},
): Promise<boolean> {
    let verificationTokenKey: { identifier: string; token: string } | undefined
    try {
        const result = await generateSignInLink(email, options)
        verificationTokenKey = result.verificationTokenKey
        const emailHtml = await render(UserInviteEmail({ name: name || email, inviteUrl: result.signInUrl }))
        const sendResult = await sendEmail({
            from: "OpenCouncil <auth@opencouncil.gr>",
            to: email,
            subject: "Πρόσκληση: Συνδεθείτε στο OpenCouncil",
            html: emailHtml,
        })
        if (!sendResult.success) throw new Error("Email send failed")
        return true
    } catch (error) {
        console.error("Failed to send invite email:", error)
        if (verificationTokenKey) {
            try {
                await prisma.verificationToken.deleteMany({ where: verificationTokenKey })
            } catch (cleanupError) {
                console.error("Failed to clean up verification token:", cleanupError)
            }
        }
        return false
    }
}

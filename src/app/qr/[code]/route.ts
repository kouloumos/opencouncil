import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { appendUtmParams } from '@/lib/utils/qr';

/**
 * Home, on whichever realm domain the scan arrived on.
 *
 * Relative Location on purpose: no absolute base is correct here. One
 * deployment serves every realm domain, so `NEXTAUTH_URL` bounced a scan on
 * opencouncil.cy to opencouncil.gr — and `req.nextUrl` is no better, because it
 * resolves to the server's bind address behind the reverse proxy (0.0.0.0:PORT
 * on previews). The browser resolves a relative Location against the origin it
 * is already on. Same reasoning as `src/app/api/utterance/[utteranceId]`.
 *
 * The path carries no locale: each realm serves its default locale unprefixed,
 * so `/` lands in the right language, where the old `/el` forced Greek.
 */
function homeOnScannedRealm(): NextResponse {
    return new NextResponse(null, { status: 302, headers: { Location: '/' } });
}

export async function GET(req: NextRequest, props: { params: Promise<{ code: string }> }) {
    const params = await props.params;
    const code = params.code;
    if (!code) {
        return homeOnScannedRealm();
    }

    const campaign = await prisma.qrCampaign.findUnique({
        where: { code },
        select: { url: true, isActive: true },
    });

    if (!campaign || !campaign.isActive) {
        // Fallback to homepage if not found/inactive
        return homeOnScannedRealm();
    }

    const destination = appendUtmParams(campaign.url, code, req.nextUrl.searchParams);

    return NextResponse.redirect(destination, 307);
}

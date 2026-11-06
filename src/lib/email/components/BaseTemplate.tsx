import * as React from 'react';
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Img,
    Text,
    Hr,
} from '@react-email/components';
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config';
import { emailCopy } from '../copy';
import { appName, isGenericMode } from '@/lib/genericMode';

/**
 * The one-line strapline under the footer rule. Localized separately from the
 * body copy because every template shares this chrome; templates that don't
 * pass a locale keep the Greek original.
 */
const TAGLINE: Record<AppLocale, string> = {
    el: 'Ψηφιακή Δημοκρατία',
    en: 'Digital Democracy',
    fr: 'Démocratie numérique',
    sr: 'Дигитална демократија',
    'sr-Latn': 'Digitalna demokratija',
};

/**
 * OpenTranscripts mails its own logo from its own host, and has no strapline:
 * "Digital Democracy" is OpenCouncil's. Reads process.env rather than
 * @/env.mjs, which the jest transform cannot parse and which every test of an
 * email would then have to mock; env.mjs still validates NEXTAUTH_URL at startup.
 */
function brand(locale: string): { name: string; logoUrl: string; tagline: string | null } {
    if (isGenericMode()) {
        return { name: appName(), logoUrl: `${process.env.NEXTAUTH_URL}/logo.png`, tagline: null };
    }
    return { name: appName(), logoUrl: 'https://opencouncil.gr/logo.png', tagline: emailCopy(TAGLINE, locale, DEFAULT_LOCALE) };
}

interface BaseTemplateProps {
    children: React.ReactNode;
    previewText?: string;
    /** UI locale for the shared chrome; defaults to the app default. */
    locale?: string;
}

export const BaseTemplate = ({
    children,
    locale = DEFAULT_LOCALE,
    // Destructured after `locale` so the default can read it: a template that
    // passes a locale but no preview text still gets its own language.
    previewText = [brand(locale).name, brand(locale).tagline].filter(Boolean).join(' - '),
}: BaseTemplateProps): React.ReactElement => (
    <Html lang={locale}>
        <Head>
            <title>{brand(locale).name}</title>
            <Preview>{previewText}</Preview>
        </Head>
        <Body style={{
            backgroundColor: '#f6f9fc',
            margin: '0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}>
            <Container style={{
                backgroundColor: '#ffffff',
                margin: '0 auto',
                padding: '20px',
                maxWidth: '600px',
                borderRadius: '8px',
                marginTop: '20px',
            }}>
                <Section style={{ textAlign: 'center' }}>
                    <Img
                        src={brand(locale).logoUrl}
                        alt={brand(locale).name}
                        width="150"
                        height="auto"
                        style={{
                            margin: '0 auto 20px',
                        }}
                    />
                </Section>

                {children}

                <Hr style={{
                    borderTop: '1px solid #e6ebf1',
                    margin: '20px 0'
                }} />

                <Section style={{
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '12px',
                }}>
                    <Text>© {new Date().getFullYear()} {brand(locale).name}. All rights reserved.</Text>
                    {brand(locale).tagline && <Text>{brand(locale).tagline}</Text>}
                </Section>
            </Container>
        </Body>
    </Html>
); 
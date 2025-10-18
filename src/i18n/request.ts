import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * Loads and merges translations from both monolithic JSON files and modular files
 * This allows for gradual migration from monolithic to modular translation structure
 * 
 * Using static imports ensures all translations are bundled in production builds
 */
async function loadTranslations(locale: string) {
    try {
        // Load the main JSON file (existing system)
        const mainMessages = (await import(`../../messages/${locale}.json`)).default;
        
        // Statically load modular translation files
        // This ensures they're included in the production bundle
        const modularMessages: Record<string, any> = {};
        
        try {
            // Load highlights module
            modularMessages.highlights = (await import(`../../messages/${locale}/highlights.json`)).default;
        } catch (e) {
            // Module doesn't exist for this locale
        }
        
        try {
            // Load transcript module
            modularMessages.transcript = (await import(`../../messages/${locale}/transcript.json`)).default;
        } catch (e) {
            // Module doesn't exist for this locale
        }
        
        try {
            // Load workspaces module
            modularMessages.workspaces = (await import(`../../messages/${locale}/workspaces.json`)).default;
        } catch (e) {
            // Module doesn't exist for this locale
        }
        
        // Merge modular messages into the main messages
        // This allows components to use both old and new translation patterns
        return {
            ...mainMessages,
            ...modularMessages
        };
    } catch (error) {
        console.error(`Failed to load translations for locale ${locale}:`, error);
        // Fallback to main JSON file only
        return (await import(`../../messages/${locale}.json`)).default;
    }
}

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that the incoming locale is valid
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    return {
        locale,
        messages: await loadTranslations(locale)
    };
});
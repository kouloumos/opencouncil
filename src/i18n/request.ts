import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * Statically imports all modular translation files
 * This ensures compatibility with Vercel's serverless environment
 * Note: When adding new modular translation files, they must be explicitly imported here
 */
async function loadModularTranslations(locale: string): Promise<Record<string, any>> {
    const modularMessages: Record<string, any> = {};
    
    try {
        // List of modular translation files to load
        // Add new modules here as they are created
        const modules = ['admin', 'editing', 'highlights', 'reviews', 'transcript', 'workspaces'];
        
        for (const moduleName of modules) {
            try {
                const moduleData = (await import(`../../messages/${locale}/${moduleName}.json`)).default;
                modularMessages[moduleName] = moduleData;
            } catch (error) {
                console.warn(`Failed to load modular translation file ${moduleName} for locale ${locale}:`, error);
            }
        }
    } catch (error) {
        console.warn(`Failed to load modular translations for locale ${locale}:`, error);
    }
    
    return modularMessages;
}

/**
 * Loads and merges translations from both monolithic JSON files and modular files
 * This allows for gradual migration from monolithic to modular translation structure
 */
async function loadTranslations(locale: string) {
    try {
        // Load the main JSON file (existing system)
        const mainMessages = (await import(`../../messages/${locale}.json`)).default;
        
        // Dynamically load all modular files
        const modularMessages = await loadModularTranslations(locale);
        
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
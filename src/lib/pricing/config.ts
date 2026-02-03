/**
 * OpenTranscript Pricing Configuration
 *
 * This is the single source of truth for all pricing-related information.
 * All pricing calculations, displays, and forms should reference this file.
 *
 * IMPORTANT: Changing these values affects new offers only. Existing offers
 * use their stored values to ensure contract stability.
 */

/**
 * Session processing pricing
 */
export const SESSION_PROCESSING = {
    /** Price per hour of meeting processing in EUR */
    pricePerHour: 9,
    label: "Ψηφιοποίηση συνεδρίασης",
    labelEn: "Meeting digitization",
    description: "Κοινή τιμολόγηση ανεξαρτήτως μεγέθους",
    descriptionEn: "Flat rate regardless of size"
} as const;

/**
 * Current pricing version for new offers
 */
export const CURRENT_OFFER_VERSION = 3 as const;


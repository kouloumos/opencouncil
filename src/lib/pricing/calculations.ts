/**
 * OpenTranscript Pricing Calculations
 */

import { Offer } from '@prisma/client';
import { SESSION_PROCESSING } from './config';

export interface OfferTotals {
    ingestionTotal: number;
    subtotal: number;
    discount: number;
    total: number;
}

/**
 * Calculate offer totals
 */
export function calculateOfferTotals(offer: Pick<Offer, 'ingestionPerHourPrice' | 'hoursToIngest' | 'discountPercentage'>): OfferTotals {
    const ingestionTotal = offer.ingestionPerHourPrice * offer.hoursToIngest;
    const subtotal = ingestionTotal;
    const discount = subtotal * (offer.discountPercentage / 100);
    const total = subtotal - discount;

    return { ingestionTotal, subtotal, discount, total };
}

/**
 * Get current session processing price per hour
 */
export function getSessionProcessingPrice(): number {
    return SESSION_PROCESSING.pricePerHour;
}

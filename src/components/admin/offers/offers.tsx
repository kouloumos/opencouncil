"use client";
import { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Offer } from '@prisma/client'
import OfferForm from "./offer-form";
import { getOffers } from "@/lib/db/offers";
import { calculateOfferTotals } from "@/lib/pricing";
import { formatCurrency, formatDate } from "@/lib/utils";

function DiscountBadge({ discount }: { discount: number }) {
    if (discount === 0) return null;
    return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            {discount}% off
        </span>
    );
}

function OfferLine({ offer }: { offer: Offer }) {
    const totals = calculateOfferTotals(offer);

    return (
        <tr className="border-b">
            <td className="py-3 px-4">
                <a href={`/offer-letter/${offer.id}`} className="hover:underline font-medium">
                    {offer.recipientName}
                </a>
            </td>
            <td className="py-3 px-4 text-right">{offer.hoursToIngest}</td>
            <td className="py-3 px-4 text-right">{formatCurrency(totals.total)}</td>
            <td className="py-3 px-4 text-right">
                <DiscountBadge discount={offer.discountPercentage} />
            </td>
            <td className="py-3 px-4 text-right text-sm text-muted-foreground">{formatDate(offer.createdAt)}</td>
        </tr>
    );
}

export default function Offers({ initialOffers }: { initialOffers: Offer[] }) {
    const [offers, setOffers] = useState<Offer[]>(initialOffers);

    const sortedOffers = [...offers].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalAmount = sortedOffers.reduce((sum, offer) => {
        return sum + calculateOfferTotals(offer).total;
    }, 0);

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Offers</h1>
                <div className="text-2xl font-semibold">
                    Total Value: {formatCurrency(totalAmount)}
                </div>
            </div>

            <Suspense fallback={
                <div className="flex justify-center items-center h-full">
                    <div className="w-4 h-4 border-t-2 border-b-2 border-gray-900 rounded-full animate-spin"></div>
                </div>
            }>
                <div className="overflow-x-auto bg-white rounded-lg border">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="text-left py-3 px-4 font-medium">Recipient</th>
                                <th className="text-right py-3 px-4 font-medium">Hours</th>
                                <th className="text-right py-3 px-4 font-medium">Total</th>
                                <th className="text-right py-3 px-4 font-medium">Discount</th>
                                <th className="text-right py-3 px-4 font-medium">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedOffers.map(offer => (
                                <OfferLine key={offer.id} offer={offer} />
                            ))}
                        </tbody>
                    </table>
                    {sortedOffers.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">No offers yet</div>
                    )}
                </div>

                <Sheet>
                    <SheetTrigger asChild>
                        <Button className="mt-4">Add Offer</Button>
                    </SheetTrigger>
                    <SheetContent className="h-full overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle>Add New Offer</SheetTitle>
                        </SheetHeader>
                        <OfferForm onSuccess={() => {
                            getOffers().then(newOffers => setOffers(newOffers));
                        }} />
                    </SheetContent>
                </Sheet>
            </Suspense>
        </div>
    );
}

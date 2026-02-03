"use client"
import { formatCurrency } from "@/lib/utils";
import { calculateOfferTotals } from "@/lib/pricing";
import { Offer } from "@prisma/client";
import { Button } from "../ui/button";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "../ui/card";
import { FileText, Copy, Check } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export default function OfferLetter({ offer }: { offer: Offer }) {
    const { ingestionTotal, subtotal, discount, total } = calculateOfferTotals(offer)
    const hasDateRange = offer.startDate && offer.endDate;

    const CTABox = () => (
        <Card className="my-8 bg-blue-50 print:break-inside-avoid print:my-6 print:bg-blue-50">
            <CardContent className="p-6">
                <p className="text-center">
                    Για να απαντήσετε σε αυτή τη προσφορά, στείλτε μoυ ένα email στο <a href={`mailto:${offer.respondToEmail}`}>{offer.respondToEmail}</a>.
                    Για ερωτήσεις, μπορείτε να με καλέσετε στο <a href={`tel:${offer.respondToPhone}`}>{offer.respondToPhone}</a>.
                </p>
            </CardContent>
        </Card>
    )
    return (
        <div className="max-w-7xl mx-auto sm:p-8 print:p-0 print:py-8 print:px-12 space-y-8 print:space-y-6 print:text-sm">
            <OfferLetterNotice offer={offer} />
            <header className="text-center space-y-4 print:break-after-avoid">
                <div className="flex items-center justify-center gap-4">
                    <Image
                        src="/logo.png"
                        alt="OpenTranscripts Logo"
                        width={64}
                        height={64}
                    />
                    <h1 className="text-4xl font-bold text-primary">OpenTranscripts</h1>
                </div>
                <h2 className="text-2xl font-semibold">
                    Οικονομική Προσφορά για {offer.recipientName}
                </h2>
                <p className="text-sm text-gray-600">
                    {formatDate(offer.createdAt)}
                </p>
            </header>

            {hasDateRange && (
                <section className="mb-8 print:break-inside-avoid">
                    <h3 className="text-2xl font-semibold mb-4">Περίοδος παροχής υπηρεσιών</h3>
                    <p>Από <span className="font-bold">{formatDate(offer.startDate!)}</span> έως <span className="font-bold">{formatDate(offer.endDate!)}</span>.</p>
                </section>
            )}

            <section className="mb-8 print:break-inside-avoid-page bg-white">
                <h3 className="text-2xl font-semibold mb-4">Κόστος</h3>
                <div className="overflow-x-auto bg-white">
                    <table className="w-full min-w-[500px] print:text-xs print:w-full bg-white">
                        <thead>
                            <tr className="border-b bg-white">
                                <th className="text-left py-2">Υπηρεσία</th>
                                <th className="text-right py-2">Μονάδα</th>
                                <th className="text-right py-2">Τιμή</th>
                                <th className="text-right py-2">Σύνολο</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b bg-white">
                                <td className="py-2">Απομαγνητοφώνηση και επεξεργασία</td>
                                <td className="text-right">{offer.hoursToIngest} ώρες</td>
                                <td className="text-right">{formatCurrency(offer.ingestionPerHourPrice)}/ώρα</td>
                                <td className="text-right">{formatCurrency(ingestionTotal)}</td>
                            </tr>
                            <tr className="border-b bg-white">
                                <td colSpan={3} className="text-right py-2">Μερικό Σύνολο</td>
                                <td className="text-right">{formatCurrency(subtotal)}</td>
                            </tr>
                            {discount > 0 && (
                                <tr className="border-b bg-white">
                                    <td colSpan={3} className="text-right py-2">Έκπτωση ({offer.discountPercentage}%)</td>
                                    <td className="text-right">-{formatCurrency(discount)}</td>
                                </tr>
                            )}
                            <tr className="bg-white">
                                <td colSpan={3} className="text-right py-2 font-bold">Σύνολο (χωρίς ΦΠΑ)</td>
                                <td className="text-right font-bold">{formatCurrency(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-sm text-gray-600">* Οι τιμές δεν περιλαμβάνουν ΦΠΑ</p>
            </section>

            <CTABox />

            <section className="mb-8 print:break-inside-avoid-page">
                <h3 className="text-2xl font-semibold mb-4">Τι περιλαμβάνει η υπηρεσία</h3>
                <p className="mb-4">Η υπηρεσία απομαγνητοφώνησης και επεξεργασίας περιλαμβάνει:</p>
                <ul className="space-y-2 list-disc pl-6">
                    <li>Αυτόματη απομαγνητοφώνηση και αναγνώριση ομιλητών, από το βίντεο και τον ήχο.</li>
                    <li>Διεπαφή επεξεργασίας για γρήγορη διόρθωση και βελτίωση της αυτόματης απομαγνητοφώνησης, με δυνατότητα ταυτόχρονης ακρόασης του ήχου και επεξεργασίας του κειμένου.</li>
                    <li>Εξαγωγή σε μορφή DOCX.</li>
                </ul>
            </section>

            <div className="print:mt-12 print:break-before-page print:block">
                <section className="mb-8 print:break-inside-avoid">
                    <h3 className="text-2xl font-semibold mb-4">Στοιχεία Εταιρείας</h3>
                    <p className="">
                        OpenCouncil Μονοπρόσωπη Ι.Κ.Ε.<br />Λαλέχου 1, Νέο Ψυχικό 15451<br />ΑΦΜ 802666391 (ΚΕΦΟΔΕ Αττικής)<br />Aριθμός ΓΕΜΗ 180529301000.
                    </p>
                    <p className="mt-2">
                        H OpenCouncil ανήκει στην <a href="https://schemalabs.gr" className="underline">Schema Labs Αστική Μη Κερδοσκοπική Εταιρεία</a>.
                    </p>
                </section>
                <CTABox />
                <footer className="mt-8 text-right print:mt-12">
                    <p className="mb-4 print:mb-6">Με εκτίμηση,</p>
                    <p className="font-bold">{offer.respondToName}</p>
                    <p>{offer.respondToEmail}</p>
                    <p>{offer.respondToPhone}</p>
                </footer>
            </div>

            <div className="fixed bottom-4 right-4 print:hidden">
                <Button onClick={() => window.print()}>Εκτύπωση</Button>
            </div>
        </div >
    )
}

export function OfferLetterNotice({ offer }: { offer: Offer }) {
    const [qrLoaded, setQrLoaded] = useState(false);
    const offerUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/offer-letter/${offer.id}`;

    return (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-8 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center print:bg-blue-50 print:border-none">
            <div>
                <p className="hidden print:block">
                    Μπορείτε να δείτε τη πιο πρόσφατη έκδοση αυτής της προσφοράς ηλεκτρονικά σκανάροντας το QR code.
                </p>
                <p className="print:hidden">
                    Αυτή η προσφορά μπορεί να εκτυπωθεί και να αποθηκευτεί σαν PDF, ή μπορείτε να τη μοιραστείτε με συνεργάτες
                    σας αντιγράφοντας το σύνδεσμο.
                </p>
            </div>
            <div className="hidden print:block">
                <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(offerUrl)}`}
                    alt="QR Code"
                    width={100}
                    height={100}
                    onLoad={() => setQrLoaded(true)}
                    priority
                    className={qrLoaded ? 'opacity-100' : 'opacity-0'}
                    unoptimized
                />
            </div>
            <div className="print:hidden flex flex-col gap-2">
                <Button
                    onClick={() => window.print()}
                    className="flex items-center justify-center gap-2 w-full"
                >
                    <FileText className="w-4 h-4" />
                    Εκτύπωση
                </Button>
                <CopyToClipboardButton offer={offer} />
            </div>
        </div>
    );
}

function CopyToClipboardButton({ offer }: { offer: Offer }) {
    const [copied, setCopied] = useState(false);

    const handleClick = async () => {
        await navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_BASE_URL}/offer-letter/${offer.id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button variant="outline" onClick={handleClick} className="w-full">
            {copied ? (
                <Check className="w-4 h-4 mr-2" />
            ) : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Αντιγράφηκε!' : 'Αντιγραφή σύνδεσμου'}
        </Button>
    );
}

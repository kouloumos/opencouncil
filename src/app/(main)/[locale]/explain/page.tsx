'use client'

import { motion } from 'framer-motion'
import { Bot, Database, ExternalLink, Share2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WordRotator } from '@/components/ui/word-rotator'
import { Button } from '@/components/ui/button'
import { Link } from "@/i18n/routing";

export default function ExplainPage() {
    return (
        <div className="relative">
            <div className="container mx-auto px-4 py-8">
                {/* Hero Section */}
                <motion.section
                    className="relative text-center py-10 h-[50vh] min-h-[400px] flex flex-col justify-center items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="flex flex-col items-center justify-center h-full z-10 relative">
                        <h1 className="text-base sm:text-xl md:text-2xl mb-4">
                            Η αυτοδιοίκηση λύνει καθημερινά προβλήματα.
                            <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold my-6 sm:my-8 md:my-12">
                                <WordRotator words={['🛣️ Τους δρόμους μας', '🏘️ Τις γειτονιές μας', '🏫 Τα σχολεία μας', '🌳 Τα πάρκα μας', '🕒 Ωράρια κατασημάτων', '🚦 Κυκλοφοριακές ρυθμίσεις', '🧹 Καθαριότητα']} />
                            </div>
                        </h1>
                        <motion.p
                            className="text-base sm:text-lg md:text-xl lg:text-2xl mb-8 max-w-3xl px-4"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                        >
                            Το OpenCouncil κάνει τις δημόσιες συνεδριάσεις της αυτοδιοίκησης απλές και πιο συμμετοχικές.
                        </motion.p>
                    </div>
                </motion.section>
                <motion.section
                    className="flex justify-center"
                >
                    <Button asChild>
                        <Link href="/athens">
                            Εξερεύνησε τα δημοτικά συμβούλια της Αθήνας
                        </Link>
                    </Button>
                </motion.section>

                {/* Features Section */}
                <motion.section
                    className="py-8 sm:py-12 md:py-16 container mx-auto"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                >
                    <h2 className="text-xl sm:text-2xl md:text-3xl text-center mb-8">
                        Η τεχνητή νοημοσύνη του OpenCouncil...
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        {[
                            {
                                description: 'Διαβάζει την ημερήσια διάταξη',
                                emoji: '📜'
                            },
                            {
                                description: 'Βλέπει τη συνεδρίαση',
                                emoji: '📹'
                            },
                            {
                                description: 'Αναγνωρίζει τους ομιλητές',
                                emoji: '🗣️'
                            },
                            {
                                description: 'Καταγράφει τα πρακτικά',
                                emoji: '📚'
                            },
                            {
                                description: 'Εντοπίζει θέματα και τοποθεσίες',
                                emoji: '📍'
                            },
                            {
                                description: 'Οργανώνει τα δεδομένα',
                                emoji: '🗄️'
                            },
                            {
                                description: 'Κάνει την πληροφορία προσβάσιμη',
                                emoji: '🔍'
                            },
                            {
                                description: 'Δημιουργεί podcast',
                                emoji: '🎙️'
                            },
                            {
                                description: 'Μοντάρει σύντομα βίντεο',
                                emoji: '📱'
                            },
                            {
                                description: 'Ενημερώνει τους δημότες',
                                emoji: '💬'
                            }
                        ].map((step, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                            >
                                <Card className="h-full">
                                    <CardContent className="p-2 sm:p-3 flex items-center gap-2">
                                        <span className="text-lg sm:text-xl">{step.emoji}</span>
                                        <p className="text-xs sm:text-sm">{step.description}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>

                <motion.section
                    className="flex flex-col items-center gap-4 mt-8"
                >
                    <Button
                        size="lg"
                        asChild
                        className="gap-2"
                    >
                        <Link href="https://schemalabs.substack.com/p/pencouncil" target="_blank">
                            <ExternalLink className="w-4 h-4" />
                            Διάβασε περισσότερα για το πως δουλεύει
                        </Link>
                    </Button>

                    <Button
                        size="lg"
                        asChild
                        variant="outline"
                        className="gap-2"
                    >
                        <Link href="/about">
                            Αν είστε στην αυτοδιοίκηση, πατήστε εδώ
                        </Link>
                    </Button>
                </motion.section>

            </div>
        </div>
    )
}
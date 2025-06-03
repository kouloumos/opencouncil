import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { ChevronDown } from 'lucide-react';
import { SubstackPost } from '@/lib/db/landing';
import { HeaderBar } from './header-bar';
import { MunicipalitySelector } from '@/components/notifications/MunicipalitySelector';
import { CityWithGeometry } from '@/lib/db/cities';

interface HeroProps {
    latestPost?: SubstackPost;
    cities: CityWithGeometry[];
}

export function Hero({ latestPost, cities }: HeroProps) {
    const { scrollY } = useScroll();
    const opacity = useTransform(scrollY, [0, 200], [1, 0]);
    const y = useTransform(scrollY, [0, 200], [0, 100]);

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2,
                delayChildren: 0.3,
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="relative min-h-[85vh] flex items-start justify-center overflow-hidden w-full">
            <motion.div
                style={{ opacity, y }}
                variants={container}
                initial="hidden"
                animate="show"
                className="relative w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8"
            >
                <motion.div variants={item} className="flex justify-center items-center pt-4 sm:pt-6">
                    <HeaderBar
                        latestPost={latestPost}
                        className="mt-0"
                    />
                </motion.div>

                <div className="text-center space-y-8 sm:space-y-10 mt-16 sm:mt-20">
                <motion.div variants={item} className="space-y-6">
                    <motion.h1
                        variants={item}
                        className="text-3xl sm:text-5xl md:text-7xl font-normal"
                    >
                        Ο Δήμος σου,{' '}
                        <span className="relative z-10 text-[hsl(var(--orange))]">
                            απλά
                        </span>
                    </motion.h1>
                </motion.div>
                <motion.p
                    variants={item}
                    className="text-sm sm:text-lg md:text-xl lg:text-2xl text-muted-foreground mx-auto leading-relaxed"
                >
                    To OpenCouncil χρησιμοποιεί{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-1 text-foreground"
                    >
                        🤖 τεχνητή νοημοσύνη
                    </motion.em>{' '}
                    για να{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        👀 παρακολουθεί
                    </motion.em>{' '}
                    τα{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        🏛️ δημοτικά συμβούλια
                    </motion.em>{' '}
                    και να τα κάνει{' '}
                    <motion.em
                        className="not-italic inline-flex items-center px-2 py-1 text-foreground"
                    >
                        💡 απλά και κατανοητά
                    </motion.em>
                </motion.p>

                {/* Municipality Selector */}
                <motion.div variants={item} className="max-w-md mx-auto">
                    <MunicipalitySelector cities={cities} />
                </motion.div>

                <motion.div
                    variants={item}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
                >
                    <Button
                        asChild
                        variant="link"
                        size="lg"
                        className="text-base sm:text-lg text-accent hover:text-accent/80 transition-colors duration-300"
                    >
                        <Link href="/about">
                            Πληροφορίες για δήμους και περιφέρειες
                        </Link>
                    </Button>
                </motion.div>
                </div>
            </motion.div>
        </section>
    );
}
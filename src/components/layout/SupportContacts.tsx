"use client"
import { Mail, Phone } from 'lucide-react'
import { useRealm } from '@/hooks/useRealm'
import { getRealmContactPhone, telHref } from '@/lib/realm'

const SUPPORT_EMAIL = 'hello@opencouncil.gr'
const linkClass = 'inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors'

/** OpenCouncil's phone and email, where a reader who hit a dead end can ask for help. */
export function SupportContacts() {
    const contactPhone = getRealmContactPhone(useRealm())

    return (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href={telHref(contactPhone)} className={linkClass}>
                <Phone className="w-4 h-4 mr-2" />
                {contactPhone}
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                <Mail className="w-4 h-4 mr-2" />
                {SUPPORT_EMAIL}
            </a>
        </div>
    )
}

"use client";

import { useEffect } from "react";
import { EMBED_PATH } from "@/lib/utils/embed";
import { isGenericMode } from "@/lib/genericMode";

// Registers public/sw.js, which caches static assets and serves the offline
// page when a navigation fails. Production builds only: a worker that served
// yesterday's chunks on a dev server would hide every change behind a hard
// reload. Embeds run inside third-party iframes and get no worker.
// OpenTranscripts is not an installable app: its offline page and manifest
// name OpenCouncil.
export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (isGenericMode()) return;
        if (!('serviceWorker' in navigator)) return;
        if (EMBED_PATH.test(window.location.pathname)) return;
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // The site works without the worker; only the offline page is lost.
        });
    }, []);

    return null;
}

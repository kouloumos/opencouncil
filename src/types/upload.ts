/**
 * Upload configuration for generating meaningful filenames
 * Simple and flexible: provide cityId/workspaceId, identifier, and optional suffix
 * 
 * Pattern: {cityId}_{identifier}_{suffix}.{ext}
 * 
 * Examples:
 *   { cityId: 'chania', identifier: 'aug15_2025', suffix: 'recording' } → chania_aug15_2025_recording.mp4
 *   { cityId: 'chania', identifier: 'aug15_2025', suffix: 'agenda' } → chania_aug15_2025_agenda.pdf
 *   { cityId: 'chania', identifier: 'democrats', suffix: 'logo' } → chania_democrats_logo.png
 *   { workspaceId: 'ws-123', identifier: 'meeting_jan15' } → ws-123_meeting_jan15.mp4
 */
export interface UploadConfig {
    /** City identifier for authorization and naming (council mode) */
    cityId?: string
    /** Workspace identifier for authorization and naming (generic mode) */
    workspaceId?: string
    /** Entity identifier (e.g., meetingId, partySlug, personSlug) */
    identifier?: string
    /** Optional suffix for the filename (e.g., 'recording', 'agenda', 'logo') */
    suffix?: string
}


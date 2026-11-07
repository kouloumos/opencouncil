import { isGenericMode } from '@/lib/genericMode';

/** The site path of a meeting, or in generic mode of a workspace transcript. */
export function meetingPagePath(cityId: string, meetingId: string): string {
    return isGenericMode() ? `/workspaces/${cityId}/transcripts/${meetingId}` : `/${cityId}/${meetingId}`;
}

/** The admin page with the tasks of a meeting, or in generic mode the tasks page of the workspace. */
export function meetingAdminPath(cityId: string, meetingId: string): string {
    return isGenericMode() ? `/workspaces/${cityId}/admin/tasks` : `/${cityId}/${meetingId}/admin`;
}

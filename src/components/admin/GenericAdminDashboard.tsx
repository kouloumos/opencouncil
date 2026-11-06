import { Folder, FileText, Loader2, TriangleAlert, Users } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { StatsCard } from '@/components/ui/stats-card';
import { getUserGrowth } from '@/lib/db/userGrowth';
import { getWorkspaceDashboardStats } from '@/lib/db/workspaces';

/** The OpenTranscripts admin dashboard: the same layout as OpenCouncil's, with workspace numbers. */
export async function GenericAdminDashboard() {
    const [users, stats] = await Promise.all([getUserGrowth(), getWorkspaceDashboardStats()]);
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return (
        <div className="container mx-auto px-4 py-8 space-y-10">
            <div>
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    An overview of users, workspaces and transcriptions across OpenTranscripts.
                </p>
            </div>

            {/* w-fit shrinks each heading box so the global centered-h2 rule
                can't visually center it within the page column. */}
            <section>
                <h2 className="w-fit mb-3">Usage</h2>
                <StatsCard
                    columns={3}
                    items={[
                        {
                            title: 'Total Users',
                            value: users.total,
                            icon: <Users className="h-4 w-4" />,
                            description: `+${users.newLast7Days} in last 7 days`,
                            trend: { value: round1(users.percentChange), isPositive: users.percentChange >= 0 },
                        },
                        {
                            title: 'Workspaces',
                            value: stats.workspaces.total,
                            icon: <Folder className="h-4 w-4" />,
                            description: `+${stats.workspaces.newLast7Days} in last 7 days`,
                        },
                        {
                            title: 'Transcripts',
                            value: stats.transcripts.total,
                            icon: <FileText className="h-4 w-4" />,
                            description: `+${stats.transcripts.newLast7Days} in last 7 days`,
                        },
                    ]}
                />
            </section>

            <section>
                <div className="flex items-baseline justify-between mb-3">
                    <h2 className="w-fit">Tasks</h2>
                    <Link href="/admin/workspaces" className="text-sm text-muted-foreground hover:text-foreground">
                        Workspaces →
                    </Link>
                </div>
                <StatsCard
                    columns={2}
                    items={[
                        {
                            title: 'Running Now',
                            value: stats.tasks.running,
                            icon: <Loader2 className="h-4 w-4" />,
                            description: 'tasks that have not finished',
                        },
                        {
                            title: 'Failed',
                            value: stats.tasks.failedLast7Days,
                            icon: <TriangleAlert className="h-4 w-4" />,
                            description: 'tasks that failed in the last 7 days',
                        },
                    ]}
                />
            </section>
        </div>
    );
}

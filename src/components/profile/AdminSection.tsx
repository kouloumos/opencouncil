import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ContactBadge } from "../layout/contact-badge";
import { Flag, User, Folder } from "lucide-react";
import { Users } from "lucide-react";
import { Building } from "lucide-react";
import { UserWithAdministers } from "@/lib/db/users";

type AdminSectionProps = {
    user: Pick<UserWithAdministers, 'isSuperAdmin' | 'administers'>;
    t: (key: string, params?: Record<string, string>) => string;
};

export function AdminSection({ user, t }: AdminSectionProps) {
    // Check if user has any workspace administrations
    const hasWorkspaceAccess = user.administers.some(admin => admin.workspace && !admin.workspace.city);
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("administration")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {user.isSuperAdmin ? (
                    <div className="space-y-4">
                        <p className="text-green-600 font-medium">
                            {t("superAdminAccess")}
                        </p>
                        <div className="flex gap-2">
                            <Button asChild>
                                <Link href="/admin">{t("goToAdmin")}</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/workspaces">{t("goToWorkspaces")}</Link>
                            </Button>
                        </div>
                    </div>
                ) : user.administers.length > 0 ? (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {user.administers.map((admin) => (
                                <AdminCard key={admin.id} admin={admin} t={t} />
                            ))}
                        </div>
                        {hasWorkspaceAccess && (
                            <div className="pt-2">
                                <Button asChild variant="outline" className="w-full">
                                    <Link href="/workspaces">{t("goToWorkspaces")}</Link>
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-gray-600">
                        <p className="text-md">{t("noAdminAccess")}</p>
                        <p className="mt-16 text-sm">
                            {t("contactForAccess")}
                        </p>
                        <div className="mt-4">
                            <ContactBadge type="Email" size="md" className="mr-4" />
                            <ContactBadge type="Phone" size="md" />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
function AdminCard({ admin, t }: { admin: AdminSectionProps['user']['administers'][0], t: AdminSectionProps['t'] }) {
    // Determine admin type based on which relation exists
    // Check for workspace first (generic mode), then city/party/person
    if (admin.workspace && !admin.workspace.city) {
        // Generic workspace (not linked to a city)
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                        <Folder className="h-10 w-10" />
                        <h3 className="font-medium">{t("adminWorkspace")}</h3>
                    </div>
                    <Link
                        href={`/workspaces/${admin.workspace.id}`}
                        className="text-blue-600 hover:underline mt-2 block"
                    >
                        {admin.workspace.name}
                    </Link>
                </CardContent>
            </Card>
        );
    }
    
    // workspace.city is the new way, cityId is kept for backward compatibility
    const city = admin.workspace?.city;
    const cityId = city?.id || admin.cityId;
    const adminType = (city || admin.cityId) ? 'city' : admin.party ? 'party' : 'person';
    
    // For city admin, create a virtual entity
    const entity = adminType === 'city' 
        ? { id: cityId!, name: city?.name || `City (${admin.cityId})` }
        : (admin as any)[adminType];

    if (!entity) return null;

    let href = '';
    if (adminType === 'city') {
        href = `/${entity.id}`;
    } else if (adminType === 'party') {
        href = `/${(entity as { cityId: string }).cityId}/parties/${entity.id}`;
    } else { // person
        href = `/${(entity as { cityId: string }).cityId}/people/${entity.id}`;
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                    {adminType === 'city' ? (
                        <Building className="h-10 w-10" />
                    ) : adminType === 'party' ? (
                        <Flag className="h-10 w-10" />
                    ) : (
                        <User className="h-10 w-10" />
                    )}
                    <h3 className="font-medium">{t(`admin${adminType.charAt(0).toUpperCase() + adminType.slice(1)}`)}</h3>
                </div>
                <Link
                    href={href}
                    className="text-blue-600 hover:underline mt-2 block"
                >
                    {entity.name}
                </Link>
            </CardContent>
        </Card>
    );
}
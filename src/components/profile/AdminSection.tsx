import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ContactBadge } from "../layout/contact-badge";
import { Flag, User } from "lucide-react";
import { Users } from "lucide-react";
import { Building } from "lucide-react";
import { UserWithAdministers } from "@/lib/db/users";

type AdminSectionProps = {
    user: Pick<UserWithAdministers, 'isSuperAdmin' | 'administers'>;
    t: (key: string, params?: Record<string, string>) => string;
};

export function AdminSection({ user, t }: AdminSectionProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("administration")}</CardTitle>
            </CardHeader>
            <CardContent>
                {user.isSuperAdmin ? (
                    <div className="space-y-4">
                        <p className="text-green-600 font-medium">
                            {t("superAdminAccess")}
                        </p>
                        <Button asChild>
                            <Link href="/admin">{t("goToAdmin")}</Link>
                        </Button>
                    </div>
                ) : user.administers.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {user.administers.map((admin) => (
                            <AdminCard key={admin.id} admin={admin} t={t} />
                        ))}
                    </div>
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
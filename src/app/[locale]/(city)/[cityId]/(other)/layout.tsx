import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getCityCached } from "@/lib/cachedData";

export default async function CityInnerLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {

    const city = await getCityCached(cityId);
    if (!city) return null;

    // Build the path elements
    const pathElements: PathElement[] = [
        {
            name: city.name,
            link: `/${cityId}`,
            city: city
        }
    ];

    return (
        <>
            <Header
                path={pathElements}
                currentEntity={{ cityId: city.id }}
            />
            {children}
            <Footer />
        </>
    );
}

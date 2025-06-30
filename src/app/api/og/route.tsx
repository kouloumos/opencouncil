import { ImageResponse } from 'next/og';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity } from '@/lib/db/cities';
import { getCouncilMeetingsCountForCity } from '@/lib/db/meetings';
import { getConsultationDataForOG } from '@/lib/db/consultations';
import { RegulationData } from '@/components/consultations/types';
import prisma from '@/lib/db/prisma';
import { getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity } from '@/lib/db/people';
import { sortSubjectsByImportance } from '@/lib/utils';
import { Container, OgHeader } from '@/components/og/shared-components';

// Meeting OG Image
const MeetingOGImage = async (cityId: string, meetingId: string) => {
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) return null;

    const meetingDate = new Date(data.dateTime);
    const formattedDate = meetingDate.toLocaleDateString('el-GR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Sort subjects by hotness
    const sortedSubjects = [...data.subjects].sort((a, b) => {
        if (a.hot && !b.hot) return -1;
        if (!a.hot && b.hot) return 1;
        return 0;
    });
    const topSubjects = sortedSubjects.slice(0, 3);
    const remainingCount = Math.max(0, data.subjects.length - 3);

    return (
        <Container>
            <OgHeader
                city={{
                    name: data.city.name_municipality,
                    logoImage: data.city.logoImage
                }}
            />

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingTop: '8px',
            }}>
                <h1 style={{
                    fontSize: 56,
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.3,
                    margin: 0,
                    maxWidth: '95%',
                }}>
                    {data.name}
                </h1>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px',
                    color: '#4b5563',
                    fontSize: 28,
                    marginTop: '8px',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <span>📅</span>
                        <span>{formattedDate}</span>
                    </div>

                    <div style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#9ca3af',
                    }} />

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        <span>📋</span>
                        <span>{data.subjects?.length || 0} Θέματα</span>
                    </div>
                </div>

                {topSubjects.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginTop: '16px',
                    }}>
                        {topSubjects.map((subject) => (
                            <div key={subject.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: subject.topic?.colorHex || '#e5e7eb',
                                padding: '10px 20px',
                                borderRadius: '9999px',
                                color: '#ffffff',
                                fontSize: 22,
                                fontWeight: 600,
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                maxWidth: '85%',
                            }}>
                                <span style={{
                                    display: 'flex',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>{subject.name}</span>
                            </div>
                        ))}
                        {remainingCount > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#6b7280',
                                fontSize: 18,
                                marginTop: '4px',
                            }}>
                                <span style={{
                                    display: 'flex'
                                }}>+{remainingCount} ακόμα θέματα</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Container>
    );
};

// City OG Image
const CityOGImage = async (cityId: string) => {
    // Fetch only the data we need in parallel
    const [city, meetingsCount, counts] = await Promise.all([
        getCity(cityId),
        getCouncilMeetingsCountForCity(cityId),
        prisma.$transaction([
            prisma.person.count({ where: { cityId } }),
            prisma.party.count({ where: { cityId } })
        ])
    ]);

    if (!city) return null;

    const [peopleCount, partiesCount] = counts;

    return (
        <Container>
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '48px',
            }}>
                {/* City Logo */}
                <div style={{
                    width: '160px',
                    height: '160px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {city.logoImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={city.logoImage}
                            height="160"
                            alt={`${city.name} logo`}
                            style={{
                                objectFit: 'contain',
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '160px',
                            height: '160px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontSize: '64px',
                        }}>
                            🏛️
                        </div>
                    )}
                </div>

                {/* City Info */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                    flex: 1,
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                    }}>
                        <h1 style={{
                            fontSize: 64,
                            fontWeight: 500,
                            color: '#111827',
                            margin: 0,
                            lineHeight: 1.2,
                        }}>
                            {city.name}
                        </h1>
                        <div style={{
                            display: 'flex',
                            fontSize: 24,
                            color: '#6b7280',
                        }}>
                            {meetingsCount} καταγεγραμμένες συνεδριάσεις
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{
                        display: 'flex',
                        gap: '32px',
                        marginTop: '8px',
                    }}>
                        {[
                            { value: meetingsCount, label: 'Συνεδριάσεις' },
                            { value: peopleCount, label: 'Μέλη' },
                            { value: partiesCount, label: 'Παρατάξεις' }
                        ].map(({ value, label }) => (
                            <div key={label} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                            }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 36,
                                    fontWeight: 600,
                                    color: '#111827',
                                }}>
                                    {value}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 18,
                                    color: '#6b7280',
                                }}>
                                    {label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Official Support Badge */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: city.officialSupport ? '#dcfce7' : '#f3f4f6',
                        color: city.officialSupport ? '#166534' : '#6b7280',
                        padding: '8px 16px',
                        borderRadius: '9999px',
                        fontSize: 16,
                        fontWeight: 500,
                        marginTop: '8px',
                        alignSelf: 'flex-start'
                    }}>
                        <span style={{
                            display: 'flex'
                        }}>
                            {city.officialSupport
                                ? `Με την υποστήριξη ${city.authorityType === 'municipality' ? 'του δήμου' : 'της περιφέρειας'}`
                                : `Χωρίς επίσημη υποστήριξη ${city.authorityType === 'municipality' ? 'του δήμου' : 'της περιφέρειας'}`
                            }
                        </span>
                    </div>
                </div>
            </div>
        </Container>
    );
};

// Consultation OG Image
const ConsultationOGImage = async (cityId: string, consultationId: string) => {
    // Helper function to fetch regulation data
    const fetchRegulationData = async (jsonUrl: string): Promise<RegulationData | null> => {
        try {
            const url = jsonUrl.startsWith('http') ? jsonUrl : `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${jsonUrl}`;
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error fetching regulation data:', error);
            return null;
        }
    };

    // Fetch consultation data with city info and comment count
    const consultationData = await getConsultationDataForOG(cityId, consultationId);

    if (!consultationData) return null;

    // Fetch regulation data
    const regulationData = await fetchRegulationData(consultationData.jsonUrl);

    // Calculate statistics
    const chaptersCount = regulationData?.regulation?.filter(item => item.type === 'chapter').length || 0;
    const geosetsCount = regulationData?.regulation?.filter(item => item.type === 'geoset').length || 0;
    const commentsCount = consultationData._count.comments;

    // Note: Removed date display to keep the layout clean

    return (
        <Container>
            <OgHeader
                city={{
                    name: consultationData.city.name_municipality,
                    logoImage: consultationData.city.logoImage
                }}
            />

            {/* Main Content */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingTop: '8px',
            }}>
                {/* Consultation Badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    padding: '10px 20px',
                    borderRadius: '9999px',
                    fontSize: 20,
                    fontWeight: 600,
                    alignSelf: 'flex-start',
                    marginBottom: '8px',
                }}>
                    <span>💬</span>
                    <span>Δημόσια Διαβούλευση</span>
                </div>

                {/* Title */}
                <h1 style={{
                    fontSize: 44,
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.2,
                    margin: 0,
                    maxWidth: '95%',
                    marginBottom: '24px',
                }}>
                    {regulationData?.title || consultationData.name}
                </h1>



                {/* Key highlights */}
                {regulationData?.regulation && chaptersCount > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}>
                        <div style={{
                            fontSize: 20,
                            fontWeight: 600,
                            color: '#374151',
                            marginBottom: '4px',
                        }}>
                            Κύρια Θέματα:
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                        }}>
                            {regulationData.regulation
                                .filter(item => item.type === 'chapter')
                                .slice(0, 3)
                                .map((chapter, index) => (
                                    <div key={chapter.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        backgroundColor: '#e0f2fe',
                                        color: '#0369a1',
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        fontSize: 16,
                                        fontWeight: 500,
                                        maxWidth: '300px',
                                    }}>
                                        <span style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {chapter.num ? `${chapter.num}. ` : ''}{chapter.title?.substring(0, 40) || 'Άτιτλο Κεφάλαιο'}{chapter.title && chapter.title.length > 40 ? '...' : ''}
                                        </span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}
            </div>
        </Container>
    );
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');
    const consultationId = searchParams.get('consultationId');

    try {
        let element;
        if (consultationId && cityId) {
            element = await ConsultationOGImage(cityId, consultationId);
        } else if (meetingId && cityId) {
            element = await MeetingOGImage(cityId, meetingId);
        } else if (cityId) {
            element = await CityOGImage(cityId);
        } else {
            return new Response('Missing required parameters', { status: 400 });
        }

        if (!element) {
            return new Response('Not found', { status: 404 });
        }

        return new ImageResponse(element, {
            width: 1200,
            height: 630,
        });
    } catch (e) {
        console.error(e);
        return new Response('Failed to generate image', { status: 500 });
    }
}
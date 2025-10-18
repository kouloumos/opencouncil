import { format } from 'date-fns';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from 'docx';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { Transcript as PrismaTranscript } from '@prisma/client';

const formatTimestamp = (timestamp: number) => {
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

interface GenericTranscriptExportData {
    transcript: TranscriptType;
    transcriptMeta: PrismaTranscript;
}

const createTitlePage = ({ transcriptMeta }: Pick<GenericTranscriptExportData, 'transcriptMeta'>) => {
    const paragraphs: Paragraph[] = [
        new Paragraph({ spacing: { before: 2880 } }),

        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
                new TextRun({
                    text: transcriptMeta.name,
                    size: 32, // 16pt
                    bold: true
                })
            ],
        }),
    ];

    if (transcriptMeta.createdAt) {
        paragraphs.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 480 },
                children: [new TextRun({
                    text: format(transcriptMeta.createdAt, 'EEEE, d MMMM yyyy'),
                    size: 24 // 12pt
                })],
            })
        );
    }

    paragraphs.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Απομαγνητοφώνηση',
                color: '666666',
                size: 20 // 10pt
            })],
        }),

        // Page break
        new Paragraph({
            pageBreakBefore: true,
        })
    );

    return paragraphs;
};

const createTranscriptSection = ({ transcript }: Pick<GenericTranscriptExportData, 'transcript'>) => {
    const paragraphs = [
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Απομαγνητοφώνηση',
                size: 28 // 14pt
            })],
        }),
    ];

    transcript.forEach((speakerSegment) => {
        const speakerName = speakerSegment.speakerTag.label || 'Speaker';

        const children = [
            new TextRun({
                text: `${speakerName} `,
                bold: true,
                size: 24 // 12pt
            }),
            new TextRun({
                text: formatTimestamp(speakerSegment.startTimestamp),
                size: 20, // 10pt
                color: '666666'
            }),
            // Add the utterance text with proper line break
            new TextRun({
                text: speakerSegment.utterances.map(u => u.text).join(' '),
                size: 24, // 12pt
                break: 1
            })
        ];

        paragraphs.push(new Paragraph({
            children,
            spacing: { before: 240, after: 240 }
        }));
    });

    return paragraphs;
};

export const renderGenericTranscriptDocx = async ({ transcript, transcriptMeta }: GenericTranscriptExportData) => {
    const doc = new Document({
        creator: "OpenTranscripts",
        description: "Απομαγνητοφώνηση",
        title: transcriptMeta.name,
        subject: "Απομαγνητοφώνηση",
        keywords: ["transcript"].join(", "),
        lastModifiedBy: "OpenTranscripts",
        sections: [{
            properties: {},
            children: [
                ...createTitlePage({ transcriptMeta }),
                ...createTranscriptSection({ transcript }),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);
    return {
        save: async () => blob
    };
};


import {
  getStatisticsFor,
  getStatisticsForTranscript,
  getBatchStatisticsForSubjects,
  Statistics,
  Stat
} from '../statistics';
import prisma from '../db/prisma';

// Mock prisma
jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    utterance: {
      findMany: jest.fn()
    },
    councilMeeting: {
      findUnique: jest.fn()
    },
    subjectSpeakerSegment: {
      findMany: jest.fn()
    },
    speakerSegment: {
      findMany: jest.fn()
    }
  }
}));

describe('Statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatisticsFor', () => {
    it('should call prisma with correct parameters for meeting statistics', async () => {
      // Mock data setup
      const mockSegments = [
        {
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe',
              role: 'Mayor',
              roles: [],
              party: {
                id: 'party-1',
                name: 'Party A'
              }
            }
          },
          topicLabels: [
            {
              topic: {
                id: 'topic-1',
                name: 'Environment'
              }
            }
          ]
        }
      ];

      (prisma.councilMeeting.findUnique as jest.Mock).mockResolvedValue({ dateTime: new Date() });
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue(mockSegments);

      await getStatisticsFor({ meetingId: 'meeting-1', cityId: 'city-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            meetingId: 'meeting-1',
            cityId: 'city-1',
            id: undefined,
            speakerTag: {
              personId: undefined
            },
            meeting: undefined,
            NOT: {
              summary: {
                type: "procedural"
              }
            }
          }),
          include: expect.objectContaining({
            speakerTag: expect.any(Object),
            topicLabels: expect.any(Object)
          })
        })
      );
    });

    it('should call prisma with correct parameters for person statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ personId: 'person-1' }, ['topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          speakerTag: expect.objectContaining({
            personId: 'person-1'
          })
        })
      }));
    });

    it('should call prisma with correct parameters for party statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ partyId: 'party-1' }, ['person', 'topic']);

      // Note: Party filtering is done in application code after the query,
      // not in the database query itself (see lines 141-148 in statistics.ts)
      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          speakerTag: {
            personId: undefined
          }
        })
      }));
    });

    it('should call prisma with correct parameters for subject statistics (new system)', async () => {
      // Mock utterances query (new system)
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([
        {
          speakerSegmentId: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 30
        }
      ]);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ subjectId: 'subject-1' }, ['person', 'party', 'topic']);

      // Verify new system was used
      expect(prisma.utterance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            discussionSubjectId: 'subject-1',
            discussionStatus: 'SUBJECT_DISCUSSION'
          }
        })
      );

      // Verify speaker segments were queried with filtered IDs
      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['segment-1'] }
          })
        })
      );
    });

    it('should fall back to old system when no utterances found', async () => {
      // Mock empty utterances (trigger fallback)
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([]);
      // Mock old system query
      (prisma.subjectSpeakerSegment.findMany as jest.Mock).mockResolvedValue([
        { speakerSegmentId: 'segment-2' }
      ]);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ subjectId: 'subject-1' }, ['person', 'party', 'topic']);

      // Verify fallback to old system
      expect(prisma.subjectSpeakerSegment.findMany).toHaveBeenCalledWith({
        where: { subjectId: 'subject-1' },
        select: { speakerSegmentId: true }
      });

      // Verify speaker segments were queried with old system IDs
      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['segment-2'] }
          })
        })
      );
    });

    it('should call prisma with correct parameters for administrative body statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ administrativeBodyId: 'admin-body-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          meeting: {
            administrativeBodyId: 'admin-body-1'
          }
        })
      }));
    });
  });

  describe('getStatisticsForTranscript', () => {
    it('should calculate total speaking seconds correctly', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: { person: null },
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: { person: null },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, []);

      expect(stats.speakingSeconds).toBe(60);
    });

    it('should handle negative or zero duration segments', async () => {
      const transcript = [
        {
          startTimestamp: 10,
          endTimestamp: 5, // Negative duration
          speakerTag: { person: null },
          topicLabels: []
        },
        {
          startTimestamp: 20,
          endTimestamp: 20, // Zero duration
          speakerTag: { person: null },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, []);

      expect(stats.speakingSeconds).toBe(0);
    });

    it('should group statistics by person correctly', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe'
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe'
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 60,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-2',
              name: 'Jane Smith'
            }
          },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['person']);

      expect(stats.people).toBeDefined();
      expect(stats.people!.length).toBe(2);

      const johnStats = stats.people!.find(p => p.item.id === 'person-1');
      expect(johnStats).toBeDefined();
      expect(johnStats!.speakingSeconds).toBe(60); // 30 + 30
      expect(johnStats!.count).toBe(2);

      const janeStats = stats.people!.find(p => p.item.id === 'person-2');
      expect(janeStats).toBeDefined();
      expect(janeStats!.speakingSeconds).toBe(40); // 100 - 60
      expect(janeStats!.count).toBe(1);
    });

    it('should group statistics by party correctly', async () => {
      const transcript = [
        {
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 50,
          speakerTag: {
            person: {
              id: 'person-1',
              roles: [
                {
                  id: 'role-1',
                  partyId: 'party-1',
                  party: {
                    id: 'party-1',
                    name: 'Party A'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
            }
          },
          topicLabels: []
        },
        {
          id: 'segment-2',
          startTimestamp: 50,
          endTimestamp: 70,
          speakerTag: {
            person: {
              id: 'person-2',
              roles: [
                {
                  id: 'role-2',
                  partyId: 'party-1',
                  party: {
                    id: 'party-1',
                    name: 'Party A'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
            }
          },
          topicLabels: []
        },
        {
          id: 'segment-3',
          startTimestamp: 70,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-3',
              roles: [
                {
                  id: 'role-3',
                  partyId: 'party-2',
                  party: {
                    id: 'party-2',
                    name: 'Party B'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
            }
          },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['party']);

      expect(stats.parties).toBeDefined();
      expect(stats.parties!.length).toBe(2);

      const partyAStats = stats.parties!.find(p => p.item.id === 'party-1');
      expect(partyAStats).toBeDefined();
      expect(partyAStats!.speakingSeconds).toBe(70); // 50 + 20

      const partyBStats = stats.parties!.find(p => p.item.id === 'party-2');
      expect(partyBStats).toBeDefined();
      expect(partyBStats!.speakingSeconds).toBe(30); // 100 - 70
    });

    it('should distribute time evenly among multiple topics', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 60,
          speakerTag: { person: null },
          topicLabels: [
            {
              topic: {
                id: 'topic-1',
                name: 'Environment'
              }
            },
            {
              topic: {
                id: 'topic-2',
                name: 'Transportation'
              }
            }
          ]
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['topic']);

      expect(stats.topics).toBeDefined();
      expect(stats.topics!.length).toBe(2);

      const topic1Stats = stats.topics!.find(t => t.item.id === 'topic-1');
      const topic2Stats = stats.topics!.find(t => t.item.id === 'topic-2');

      expect(topic1Stats!.speakingSeconds).toBe(30); // 60 / 2
      expect(topic2Stats!.speakingSeconds).toBe(30); // 60 / 2
    });

    it('should handle segments without persons or topics', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: { person: null }, // No person
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe',
              party: null // No party
            }
          },
          topicLabels: [] // No topics
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['person', 'party', 'topic']);

      expect(stats.speakingSeconds).toBe(60);
      expect(stats.people!.length).toBe(1);
      expect(stats.parties!.length).toBe(0);
      expect(stats.topics!.length).toBe(0);
    });
  });

  describe('getBatchStatisticsForSubjects', () => {
    it('should return empty map for empty subject IDs', async () => {
      const result = await getBatchStatisticsForSubjects([]);
      expect(result.size).toBe(0);
    });

    it('should batch fetch utterances for multiple subjects (new system)', async () => {
      const mockUtterances = [
        { discussionSubjectId: 'subject-1', speakerSegmentId: 'segment-1', startTimestamp: 0, endTimestamp: 30 },
        { discussionSubjectId: 'subject-1', speakerSegmentId: 'segment-1', startTimestamp: 30, endTimestamp: 60 },
        { discussionSubjectId: 'subject-2', speakerSegmentId: 'segment-2', startTimestamp: 0, endTimestamp: 45 }
      ];

      const mockSegments = [
        {
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe',
              roles: [{
                id: 'role-1',
                partyId: 'party-1',
                party: { id: 'party-1', name: 'Party A' },
                startDate: new Date('2020-01-01'),
                endDate: null
              }]
            }
          }
        },
        {
          id: 'segment-2',
          startTimestamp: 0,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-2',
              name: 'Jane Smith',
              roles: [{
                id: 'role-2',
                partyId: 'party-2',
                party: { id: 'party-2', name: 'Party B' },
                startDate: new Date('2020-01-01'),
                endDate: null
              }]
            }
          }
        }
      ];

      (prisma.utterance.findMany as jest.Mock).mockResolvedValue(mockUtterances);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue(mockSegments);

      const result = await getBatchStatisticsForSubjects(['subject-1', 'subject-2']);

      // Verify batch query was made
      expect(prisma.utterance.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.utterance.findMany).toHaveBeenCalledWith({
        where: {
          discussionSubjectId: { in: ['subject-1', 'subject-2'] },
          discussionStatus: 'SUBJECT_DISCUSSION'
        },
        select: {
          discussionSubjectId: true,
          speakerSegmentId: true,
          startTimestamp: true,
          endTimestamp: true
        }
      });

      // Verify results
      expect(result.size).toBe(2);

      const subject1Stats = result.get('subject-1');
      expect(subject1Stats).toBeDefined();
      expect(subject1Stats!.speakingSeconds).toBe(60); // 30 + 30
      expect(subject1Stats!.people!.length).toBe(1);
      expect(subject1Stats!.people![0].item.id).toBe('person-1');

      const subject2Stats = result.get('subject-2');
      expect(subject2Stats).toBeDefined();
      expect(subject2Stats!.speakingSeconds).toBe(45);
      expect(subject2Stats!.people!.length).toBe(1);
      expect(subject2Stats!.people![0].item.id).toBe('person-2');
    });

    it('should fall back to old system for subjects without utterances', async () => {
      // subject-1 has utterances (new system), subject-2 does not (old system fallback)
      const mockUtterances = [
        { discussionSubjectId: 'subject-1', speakerSegmentId: 'segment-1', startTimestamp: 0, endTimestamp: 30 }
      ];

      const mockSubjectSpeakerSegments = [
        { subjectId: 'subject-2', speakerSegmentId: 'segment-2' }
      ];

      const mockSegments = [
        {
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 100,
          speakerTag: { person: { id: 'person-1', name: 'John', roles: [] } }
        },
        {
          id: 'segment-2',
          startTimestamp: 0,
          endTimestamp: 50,
          speakerTag: { person: { id: 'person-2', name: 'Jane', roles: [] } }
        }
      ];

      (prisma.utterance.findMany as jest.Mock).mockResolvedValue(mockUtterances);
      (prisma.subjectSpeakerSegment.findMany as jest.Mock).mockResolvedValue(mockSubjectSpeakerSegments);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue(mockSegments);

      const result = await getBatchStatisticsForSubjects(['subject-1', 'subject-2']);

      // Verify fallback query was made for subject-2
      expect(prisma.subjectSpeakerSegment.findMany).toHaveBeenCalledWith({
        where: { subjectId: { in: ['subject-2'] } },
        select: { subjectId: true, speakerSegmentId: true }
      });

      expect(result.size).toBe(2);

      // subject-1: uses utterance duration (30)
      const subject1Stats = result.get('subject-1');
      expect(subject1Stats!.speakingSeconds).toBe(30);

      // subject-2: uses full segment duration (50)
      const subject2Stats = result.get('subject-2');
      expect(subject2Stats!.speakingSeconds).toBe(50);
    });

    it('should return empty statistics for subjects with no data in either system', async () => {
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.subjectSpeakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getBatchStatisticsForSubjects(['subject-1', 'subject-2']);

      expect(result.size).toBe(2);
      expect(result.get('subject-1')).toEqual({
        speakingSeconds: 0,
        people: [],
        parties: [],
        topics: []
      });
      expect(result.get('subject-2')).toEqual({
        speakingSeconds: 0,
        people: [],
        parties: [],
        topics: []
      });
    });
  });
});
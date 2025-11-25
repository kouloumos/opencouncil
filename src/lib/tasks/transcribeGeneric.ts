"use server";

import { TranscribeRequest, TranscribeResult, Voiceprint } from "../apiTypes";
import { startTask } from "./tasks";
import prisma from "../db/prisma";

async function deleteExistingSpeakerData(transcriptId: string, workspaceId: string) {
    console.log(`Deleting existing speaker data for transcript ${transcriptId}`);
    
    // Get all unique speakerTagIds used by this transcript's segments
    const speakerSegments = await prisma.speakerSegment.findMany({
        where: {
            transcriptId,
            workspaceId
        },
        select: {
            speakerTagId: true
        }
    });
    
    const speakerTagIds = [...new Set(speakerSegments.map(s => s.speakerTagId))];
    
    // Delete the SpeakerTags, which will cascade delete the SpeakerSegments
    if (speakerTagIds.length > 0) {
        await prisma.speakerTag.deleteMany({
            where: {
                id: { in: speakerTagIds }
            }
        });
        console.log(`Deleted ${speakerTagIds.length} speaker tags and their associated segments`);
    }
}

/**
 * Request transcription for any transcript (generic)
 */
export async function requestTranscribeTranscript(
  workspaceId: string,
  transcriptId: string,
  options: {
    youtubeUrl: string;
    customVocabulary?: string[];
    customPrompt?: string;
    voiceprints?: Voiceprint[];
    force?: boolean;
  }
) {
  console.log(`Requesting transcription for transcript ${transcriptId}`);

  // Check if transcript exists and has speaker segments
  const transcript = await prisma.transcript.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: transcriptId
      }
    },
    include: {
      speakerSegments: {
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  if (!transcript) {
    throw new Error("Transcript not found");
  }

  if (transcript.speakerSegments.length > 0) {
    if (options.force) {
      await deleteExistingSpeakerData(transcriptId, workspaceId);
    } else {
      console.log(`Transcript already has speaker segments`);
      throw new Error('Transcript already has speaker segments');
    }
  }

  // Prepare transcription request
  const body: Omit<TranscribeRequest, 'callbackUrl'> = {
    youtubeUrl: options.youtubeUrl,
    customVocabulary: options.customVocabulary,
    customPrompt: options.customPrompt,
    voiceprints: options.voiceprints,
  };

  // Update transcript with video URL
  await prisma.transcript.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: transcriptId
      }
    },
    data: {
      videoUrl: options.youtubeUrl
    }
  });

  console.log(`Transcribe body: ${JSON.stringify(body)}`);
  return startTask('transcribe', body, transcriptId, workspaceId, { force: options.force });
}

/**
 * Handle transcription result for any transcript (generic)
 */
export async function   handleTranscribeResultGeneric(
  taskId: string,
  response: TranscribeResult,
  options?: { force?: boolean }
) {
  const videoUrl = response.videoUrl;
  const audioUrl = response.audioUrl;
  const muxPlaybackId = response.muxPlaybackId;

  const task = await prisma.taskStatus.findUnique({
    where: {
      id: taskId
    },
    include: {
      transcript: {
        include: {
          speakerSegments: {
            select: {
              id: true
            },
            take: 1
          }
        }
      }
    }
  });

  if (!task || !task.transcript) {
    throw new Error('Task or transcript not found');
  }

  // If force mode or if speaker segments already exist, delete them first
  // Note: We delete SpeakerTags (not SpeakerSegments) because the cascade relationship
  // goes from SpeakerTag -> SpeakerSegment, so deleting SpeakerTags will automatically
  // delete their associated SpeakerSegments via onDelete: Cascade
  if (options?.force || task.transcript.speakerSegments.length > 0) {
    await deleteExistingSpeakerData(task.transcriptId, task.workspaceId);
  }

  // Update transcript with video/audio URLs
  await prisma.transcript.update({
    where: {
      workspaceId_id: {
        workspaceId: task.workspaceId,
        id: task.transcriptId
      }
    },
    data: {
      videoUrl,
      audioUrl,
      muxPlaybackId
    }
  });

  // Pre-compute speaker segments and utterance mappings before transaction
  // This reduces time spent inside the transaction
  console.log(`Pre-computing speaker segments and utterance mappings...`);
  const preComputeStart = Date.now();
  
  const speakerSegmentsData = getSpeakerSegmentsFromUtterances(response.transcript.transcription.utterances);
  
  // Pre-map utterances to segments to avoid filtering inside transaction
  const segmentUtteranceMap = new Map<number, typeof response.transcript.transcription.utterances>();
  speakerSegmentsData.forEach((segment, index) => {
    const segmentUtterances = response.transcript.transcription.utterances.filter(
      u => u.start >= segment.startTimestamp && u.end <= segment.endTimestamp
    );
    segmentUtteranceMap.set(index, segmentUtterances);
  });
  
  console.log(`Pre-computed ${speakerSegmentsData.length} segments with utterances in ${((Date.now() - preComputeStart) / 1000).toFixed(2)}s`);
  
  // Start a transaction to create speaker segments and utterances
  console.log(`Starting transaction to create speaker segments and utterances`);
  const transactionStartTime = Date.now();
  
  await prisma.$transaction(async (tx) => {
    // Create speaker tags with identification when available
    const speakerTags = new Map<number, string>();
    let identifiedSpeakersCount = 0;

    // Process speaker identification results
    if (response.transcript.transcription.speakers && response.transcript.transcription.speakers.length > 0) {
      console.log(`Found ${response.transcript.transcription.speakers.length} speakers in the response`);

      // First, validate all speaker IDs before creating any speaker tags
      for (const speakerInfo of response.transcript.transcription.speakers) {
        if (speakerInfo.match) {
          // Verify the speaker exists before attempting to connect
          const speakerExists = await tx.speaker.findUnique({
            where: { id: speakerInfo.match }
          });

          if (!speakerExists) {
            console.warn(`Warning: Speaker with ID ${speakerInfo.match} not found. Skipping speaker connection for speaker ${speakerInfo.speaker}`);
            speakerInfo.match = null; // Remove the invalid match
          }
        }
      }

      // Create speaker tags for all speakers
      console.log(`Creating ${response.transcript.transcription.speakers.length} speaker tags...`);
      for (const speakerInfo of response.transcript.transcription.speakers) {
        const speakerTag = await tx.speakerTag.create({
          data: {
            label: `SPEAKER_${speakerInfo.speaker}`,
            // Connect to Speaker if match exists
            ...(speakerInfo.match ? { speaker: { connect: { id: speakerInfo.match } } } : {})
          }
        });

        if (speakerInfo.match) {
          identifiedSpeakersCount++;
        }

        speakerTags.set(speakerInfo.speaker, speakerTag.id);
      }
    } else {
      throw new Error('No speakers found. Process cannot continue');
    }

    console.log(`Created ${speakerTags.size} speaker tags (${identifiedSpeakersCount} identified with speakers)`);

    // Sanity check: Make sure we have a speaker tag for each unique speaker in the utterances
    const uniqueSpeakersInUtterances = new Set(response.transcript.transcription.utterances.map(u => u.speaker));
    let missingSpeakerTagsCount = 0;

    for (const speaker of uniqueSpeakersInUtterances) {
      if (!speakerTags.has(speaker)) {
        console.warn(`Missing speaker tag for speaker ${speaker} found in utterances. Creating it now.`);
        const speakerTag = await tx.speakerTag.create({
          data: {
            label: `SPEAKER_${speaker}`
          }
        });
        speakerTags.set(speaker, speakerTag.id);
        missingSpeakerTagsCount++;
      }
    }

    if (missingSpeakerTagsCount > 0) {
      console.log(`Created ${missingSpeakerTagsCount} additional speaker tags from sanity check`);
    } else {
      console.log(`Sanity check passed: All speakers in utterances have corresponding speaker tags`);
    }

    // OPTIMIZATION: Create segments in parallel batches with nested utterances
    // This dramatically reduces database round-trips from 2N sequential to N/BATCH_SIZE parallel batches
    // Performance: ~10-50x faster than sequential processing
    console.log(`Creating ${speakerSegmentsData.length} segments with nested utterances in parallel batches...`);
    const segmentCreationStart = Date.now();
    
    const BATCH_SIZE = 50; // Process 50 segments at a time in parallel
    let processedSegments = 0;
    
    for (let i = 0; i < speakerSegmentsData.length; i += BATCH_SIZE) {
      const batch = speakerSegmentsData.slice(i, i + BATCH_SIZE);
      
      // Create all segments in this batch in parallel with their utterances
      await Promise.all(batch.map(async (segment, batchIndex) => {
        const segmentIndex = i + batchIndex;
        const segmentUtterances = segmentUtteranceMap.get(segmentIndex)!;

        // Create segment with nested utterances in a single DB operation
        return tx.speakerSegment.create({
          data: {
            startTimestamp: segment.startTimestamp,
            endTimestamp: segment.endTimestamp,
            speakerTagId: speakerTags.get(Number(segment.speakerTagId))!,
            transcriptId: task.transcriptId,
            workspaceId: task.workspaceId,
            utterances: {
              createMany: {
                data: segmentUtterances.map(utterance => ({
                  startTimestamp: utterance.start,
                  endTimestamp: utterance.end,
                  text: utterance.text,
                  drift: utterance.drift,
                }))
              }
            }
          }
        });
      }));
      
      processedSegments += batch.length;
      const elapsed = ((Date.now() - segmentCreationStart) / 1000).toFixed(1);
      console.log(`Batch progress: ${processedSegments}/${speakerSegmentsData.length} segments created - ${elapsed}s elapsed`);
    }

    const transactionDuration = ((Date.now() - transactionStartTime) / 1000).toFixed(2);
    console.log(`Successfully created ${speakerSegmentsData.length} speaker segments with all utterances in ${transactionDuration}s`);
  }, {
    timeout: 4 * 60 * 1000, // 4 minutes - well under Vercel's 5 minute limit to allow for cleanup
    maxWait: 5000, // Maximum time to wait for a connection from the pool (5 seconds)
  });
  
  console.log(`Transaction completed successfully`);
}

/**
 * Helper: Generate speaker segments from utterances
 */
function getSpeakerSegmentsFromUtterances(utterances: any[]): any[] {
  const speakerSegments: any[] = [];

  let currentSpeaker: number | null = null;
  let currentSegment: any | null = null;

  for (let i = 0; i < utterances.length; i++) {
    const utterance = utterances[i];

    if (currentSpeaker !== utterance.speaker ||
      (currentSegment && utterance.start - currentSegment.endTimestamp! > 5)) {
      // Start a new segment
      if (currentSegment) {
        speakerSegments.push(currentSegment);
      }
      currentSegment = {
        startTimestamp: utterance.start,
        endTimestamp: utterance.end,
        speakerTagId: utterance.speaker.toString()
      };
      currentSpeaker = utterance.speaker;
    } else {
      // Continue the current segment
      currentSegment!.endTimestamp = utterance.end;
    }

    // If it's the last utterance, add the current segment
    if (i === utterances.length - 1 && currentSegment) {
      speakerSegments.push(currentSegment);
    }
  }

  return speakerSegments;
}


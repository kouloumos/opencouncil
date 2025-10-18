"use server";

import { TaskUpdate } from '../apiTypes';
import { handleTranscribeResult } from './transcribe';
import { handleSummarizeResult } from './summarize';
import prisma from '@/lib/db/prisma';
import { handleGeneratePodcastSpecResult } from './generatePodcastSpec';
import { handleSplitMediaFileResult } from './splitMediaFile';
import { handleFixTranscriptResult } from './fixTranscript';
import { handleProcessAgendaResult } from './processAgenda';
import { handleGenerateVoiceprintResult } from './generateVoiceprint';
import { handleSyncElasticsearchResult } from './syncElasticsearch';
import { withUserAuthorizedToEdit } from '../auth';
import { env } from '@/env.mjs';
import { handleGenerateHighlightResult } from './generateHighlight';
import { sendTaskStartedAdminAlert, sendTaskCompletedAdminAlert, sendTaskFailedAdminAlert } from '@/lib/discord';
import { Prisma } from '@prisma/client';

const taskStatusWithMeetingInclude = {
    transcript: {
        select: {
            name: true,
            councilMeeting: {
                select: {
                    name_en: true,
                    city: {
                        select: {
                            name_en: true
                        }
                    }
                }
            }
        }
    }
} satisfies Prisma.TaskStatusInclude;

export const startTask = async (taskType: string, requestBody: any, councilMeetingId: string, cityId: string, options: { force?: boolean } = {}) => {
    // Check for existing running task
    const existingTask = await prisma.taskStatus.findFirst({
        where: {
            transcriptId: councilMeetingId,
            workspaceId: cityId,
            type: taskType,
            status: { notIn: ['failed', 'succeeded'] }
        }
    });

    if (existingTask && !options.force) {
        throw new Error(`A task of type ${taskType} is already running for this transcript`);
    }

    // Create new task in database
    const newTask = await prisma.taskStatus.create({
        data: {
            type: taskType,
            status: 'pending',
            requestBody: JSON.stringify(requestBody),
            transcript: { 
                connect: { 
                    workspaceId_id: { workspaceId: cityId, id: councilMeetingId } 
                } 
            }
        },
        include: taskStatusWithMeetingInclude
    });

    // Prepare callback URL
    const callbackUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/cities/${cityId}/meetings/${councilMeetingId}/taskStatuses/${newTask.id}`;
    console.log(`Callback URL: ${callbackUrl}`);

    // Add callback URL to request body
    const fullRequestBody = { ...requestBody, callbackUrl };

    // Call the backend API
    let response;
    let error;
    try {
        console.log(`Calling ${env.TASK_API_URL}/${taskType} with body ${JSON.stringify(fullRequestBody)}`);
        response = await fetch(`${env.TASK_API_URL}/${taskType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.TASK_API_KEY}`,
            },
            body: JSON.stringify(fullRequestBody),
        });
    } catch (err) {
        error = err;
        console.error('Error starting task:', error);
    }

    if (error || !response || !response.ok) {
        // Update task status to failed if API call fails
        await prisma.taskStatus.update({
            where: { id: newTask.id },
            data: { status: 'failed' }
        });

        let errorMessage = 'no response body';
        if (response) {
            console.log(`Status: ${response.status}`);
            const responseText = await response.text();
            try {
                const body = JSON.parse(responseText);
                errorMessage = body.error || responseText;
            } catch (e) {
                errorMessage = responseText;
            }
        } else if (error) {
            errorMessage = (error as Error).message;
        }

        throw new Error(`Failed to start task: ${response?.statusText} (${errorMessage})`);
    }

    // Update task with full request body including callback URL
    await prisma.taskStatus.update({
        where: { id: newTask.id },
        data: { requestBody: JSON.stringify(fullRequestBody) }
    });

    // Council-specific: Send Discord admin alert
    sendTaskStartedAdminAlert({
        taskType: taskType,
        cityName: newTask.transcript.councilMeeting?.city.name_en || 'Unknown',
        meetingName: newTask.transcript.councilMeeting?.name_en || newTask.transcript.name,
        taskId: newTask.id,
        cityId: cityId,
        meetingId: councilMeetingId,
    });

    return newTask;
}

export const handleTaskUpdate = async <T>(taskId: string, update: TaskUpdate<T>, processResult: (taskId: string, result: T) => Promise<void>) => {
    // Get task details for Discord admin alerts
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        include: taskStatusWithMeetingInclude
    });

    if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
    }

    if (update.status === 'success') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'succeeded', responseBody: JSON.stringify(update.result), version: update.version }
        });

        if (update.result) {
            try {
                await processResult(taskId, update.result);

                // Send Discord admin alert for successful completion AFTER processing succeeds
                sendTaskCompletedAdminAlert({
                    taskType: task.type,
                    cityName: task.transcript.councilMeeting?.city.name_en || 'Unknown',
                    meetingName: task.transcript.councilMeeting?.name_en || task.transcript.name,
                    taskId: task.id,
                    cityId: task.workspaceId,
                    meetingId: task.transcriptId,
                });
            } catch (error) {
                console.error(`Error processing result for task ${taskId}: ${error}`);
                await prisma.taskStatus.update({
                    where: { id: taskId },
                    data: { status: 'failed', version: update.version }
                });

                // Send Discord admin alert for processing failure
                sendTaskFailedAdminAlert({
                    taskType: task.type,
                    cityName: task.transcript.councilMeeting?.city.name_en || 'Unknown',
                    meetingName: task.transcript.councilMeeting?.name_en || task.transcript.name,
                    taskId: task.id,
                    cityId: task.workspaceId,
                    meetingId: task.transcriptId,
                    error: (error as Error).message,
                });
            }
        } else {
            console.log(`No result for task ${taskId}`);

            // Task succeeded but has no result to process - still send completion admin alert
            sendTaskCompletedAdminAlert({
                taskType: task.type,
                cityName: task.transcript.councilMeeting?.city.name_en || 'Unknown',
                meetingName: task.transcript.councilMeeting?.name_en || task.transcript.name,
                taskId: task.id,
                cityId: task.workspaceId,
                meetingId: task.transcriptId,
            });
        }
    } else if (update.status === 'error') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'failed', responseBody: update.error, version: update.version }
        });

        // Send Discord admin alert for task failure
        sendTaskFailedAdminAlert({
            taskType: task.type,
            cityName: task.transcript.councilMeeting?.city.name_en || 'Unknown',
            meetingName: task.transcript.councilMeeting?.name_en || task.transcript.name,
            taskId: task.id,
            cityId: task.workspaceId,
            meetingId: task.transcriptId,
            error: update.error,
        });
    } else if (update.status === 'processing') {
        await prisma.taskStatus.update({
            where: { id: taskId },
            data: { status: 'pending', stage: update.stage, percentComplete: update.progressPercent, version: update.version }
        });
    }
}

export const processTaskResponse = async (taskType: string, taskId: string) => {
    console.log(`Processing task response for task ${taskId} of type ${taskType}`);
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) {
        console.error(`Task ${taskId} not found`);
        return;
    }
    if (taskType === 'transcribe') {
        await handleTranscribeResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'summarize') {
        await handleSummarizeResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'generatePodcastSpec') {
        await handleGeneratePodcastSpecResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'splitMediaFile') {
        await handleSplitMediaFileResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'fixTranscript') {
        await handleFixTranscriptResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'processAgenda') {
        await handleProcessAgendaResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'generateVoiceprint') {
        await handleGenerateVoiceprintResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'syncElasticsearch') {
        await handleSyncElasticsearchResult(taskId, JSON.parse(task.responseBody!));
    } else if (taskType === 'generateHighlight') {
        await handleGenerateHighlightResult(taskId, JSON.parse(task.responseBody!));
    } else {
        throw new Error(`Unsupported task type: ${taskType}`);
    }
}

export const getHighestVersionsForTasks = async (taskTypes: string[]): Promise<Record<string, number | null>> => {
    await withUserAuthorizedToEdit({});
    const tasks = await prisma.taskStatus.findMany({
        select: {
            type: true,
            version: true
        },
        where: { type: { in: taskTypes } },
        orderBy: { version: 'desc' },
    });

    const highestVersions: Record<string, number | null> = {};

    // Initialize all task types with null version
    taskTypes.forEach(type => {
        highestVersions[type] = null;
    });

    // Update with highest version found for each type
    tasks.forEach(task => {
        if (highestVersions[task.type] === null || (task.version !== null && task.version > (highestVersions[task.type] ?? 0))) {
            highestVersions[task.type] = task.version;
        }
    });

    return highestVersions;
}

export const getTaskVersionsForMeetings = async (taskTypes: string[]): Promise<Record<string, any>[]> => {
    await withUserAuthorizedToEdit({});
    // Get all meetings via transcripts
    const transcripts = await prisma.transcript.findMany({
        select: {
            id: true,
            workspaceId: true,
            councilMeeting: {
                select: {
                    cityId: true,
                    city: {
                        select: {
                            isPending: true
                        }
                    }
                }
            },
            taskStatuses: {
                where: {
                    type: {
                        in: taskTypes
                    },
                    status: "success" // Only get completed tasks
                },
                select: {
                    type: true,
                    version: true
                },
                orderBy: {
                    version: 'desc'
                }
            }
        },
        where: {
            councilMeeting: {
                city: {
                    isPending: false
                }
            }
        }
    });

    // Transform into desired format
    return transcripts.map(transcript => {
        const result: Record<string, any> = {
            cityId: transcript.councilMeeting?.cityId || transcript.workspaceId,
            meetingId: transcript.id
        };

        // Add version for each task type
        taskTypes.forEach(taskType => {
            const taskStatus = transcript.taskStatuses.find(t => t.type === taskType);
            result[taskType] = taskStatus?.version ?? null;
        });

        return result;
    });
};

export const getTaskVersionsGroupedByCity = async (taskTypes: string[]): Promise<Record<string, any>> => {
    await withUserAuthorizedToEdit({});

    // Get all meetings with their task versions
    const meetingsWithVersions = await getTaskVersionsForMeetings(taskTypes);

    // Get city information
    const cities = await prisma.city.findMany({
        where: {
            isPending: false
        },
        select: {
            id: true,
            name: true,
            name_en: true
        }
    });

    // Group by city
    const groupedByCity: Record<string, any> = {};

    // Initialize with empty arrays for each city
    cities.forEach(city => {
        groupedByCity[city.id] = {
            cityId: city.id,
            cityName: city.name,
            cityNameEn: city.name_en,
            meetings: [],
            meetingCount: 0
        };
    });

    // Add meetings to their respective cities
    meetingsWithVersions.forEach(meeting => {
        const cityId = meeting.cityId;
        if (groupedByCity[cityId]) {
            groupedByCity[cityId].meetings.push(meeting);
            groupedByCity[cityId].meetingCount++;
        }
    });

    return groupedByCity;
};
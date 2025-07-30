# PRD: Add Empty Speaker Segment Before Feature

## **Overview**
Extend the existing speaker segment editing functionality to allow administrators to create empty speaker segments **before** the first segment in the transcript. This complements the current `createEmptySegmentAfter` functionality and addresses edge cases where content needs to be added at the beginning of the transcript.

## **Background**
Currently, administrators can only add empty speaker segments **after** existing segments using the `createEmptySegmentAfter` function. However, there are scenarios where content needs to be inserted **before** the first segment. This is particularly important for:

1. **Pre-meeting content**: Adding opening remarks or procedural content that occurs before the first detected speaker segment
2. **Missing context**: Inserting missed speaker introductions or procedural announcements
3. **Transcript corrections**: Fixing speaker segment boundaries when automated transcription misses early content

## **Requirements**

### **Functional Requirements**

1. **Core Functionality**
   - Create a new `createEmptySpeakerSegmentBefore()` function that mirrors the existing `createEmptySegmentAfter()` logic
   - Add UI control to trigger segment creation before the first segment only
   - Maintain proper timestamp sequencing to avoid overlaps or gaps

2. **Timestamp Management**
   - Calculate timestamps by working backwards from the first segment's start timestamp
   - Handle the edge case where the first segment starts at or near timestamp 0
   - Ensure new segment timestamps don't create conflicts with the existing first segment

3. **Authorization & Validation**
   - Use existing `withUserAuthorizedToEdit()` authorization pattern
   - Follow same validation rules as the existing `createEmptySegmentAfter()` function

4. **State Management**
   - Update `CouncilMeetingDataContext` to include the new function
   - Properly insert new segments into the transcript array at the beginning
   - Update speaker tags state appropriately

### **Technical Requirements**

1. **Database Function** (`src/lib/db/speakerSegments.ts`)
   - `createEmptySpeakerSegmentBefore(beforeSegmentId, cityId, meetingId)`
   - Return type matches existing segment creation functions
   - Handle timestamp calculations to avoid overlaps with the first segment

2. **Context Integration** (`src/components/meetings/CouncilMeetingDataContext.tsx`)
   - Add `createEmptySegmentBefore` method to context interface
   - Implement proper state updates for transcript and speaker tags

3. **UI Component** (`src/components/meetings/transcript/SpeakerSegment.tsx`)
   - Add conditional "Add Segment Before" button
   - Show only for the first segment in the transcript
   - Follow existing hover state and styling patterns

### **Non-Functional Requirements**

1. **Performance**: Minimal impact on transcript loading and rendering
2. **Consistency**: Follow existing code patterns and styling
3. **Usability**: Intuitive placement and clear visual feedback
4. **Maintainability**: Reuse existing logic and patterns where possible

## **Detailed Design**

### **Database Layer**

**New Function**: `createEmptySpeakerSegmentBefore()`

```typescript
export async function createEmptySpeakerSegmentBefore(
    beforeSegmentId: string,
    cityId: string,
    meetingId: string
): Promise<SpeakerSegment & {
    utterances: Utterance[];
    speakerTag: SpeakerTag;
    topicLabels: (TopicLabel & { topic: Topic })[];
    summary: Summary | null;
}> {
    // Get the first segment that we're inserting before
    const firstSegment = await prisma.speakerSegment.findUnique({
        where: { id: beforeSegmentId },
        include: { utterances: true, speakerTag: true }
    });

    if (!firstSegment) {
        throw new Error('Segment not found');
    }

    await withUserAuthorizedToEdit({ cityId });

    // Calculate timestamps for the new segment
    // We want to create a small segment before the first segment
    const endTimestamp = firstSegment.startTimestamp - 0.01;
    const startTimestamp = Math.max(0, endTimestamp - 0.01);

    // If the first segment starts too close to 0, we need to adjust
    if (startTimestamp < 0 || startTimestamp >= endTimestamp) {
        throw new Error('Cannot create segment before first segment: insufficient timestamp space');
    }

    // Create a new speaker tag
    const newSpeakerTag = await prisma.speakerTag.create({
        data: {
            label: "New speaker segment",
            personId: null
        }
    });

    // Create the new segment
    const newSegment = await prisma.speakerSegment.create({
        data: {
            startTimestamp,
            endTimestamp,
            cityId,
            meetingId,
            speakerTagId: newSpeakerTag.id
        },
        include: {
            utterances: true,
            speakerTag: {
                include: {
                    person: {
                        include: {
                            roles: {
                                include: {
                                    party: true,
                                    city: true,
                                    administrativeBody: true
                                }
                            }
                        }
                    }
                }
            },
            summary: true,
            topicLabels: {
                include: {
                    topic: true
                }
            }
        }
    });

    console.log(`Created a new speaker segment before first segment: ${startTimestamp} - ${endTimestamp}. First segment starts at ${firstSegment.startTimestamp}`);

    return newSegment;
}
```

### **Context Layer**

**Update**: `CouncilMeetingDataContext.tsx`

```typescript
// Add to interface
export interface CouncilMeetingDataContext extends MeetingData {
    // ... existing methods
    createEmptySegmentBefore: (beforeSegmentId: string) => Promise<void>;
}

// Add to implementation
createEmptySegmentBefore: async (beforeSegmentId: string) => {
    const newSegment = await createEmptySpeakerSegmentBefore(
        beforeSegmentId,
        data.meeting.cityId,
        data.meeting.id
    );

    // Insert the new segment at the beginning of the transcript
    setTranscript(prev => [newSegment, ...prev]);

    // Add the new speaker tag to our state
    setSpeakerTags(prev => [...prev, newSegment.speakerTag]);
}
```

### **UI Layer**

**Update**: `SpeakerSegment.tsx`

```typescript
const AddSegmentBeforeButton = ({ segmentId, isFirstSegment }: { 
    segmentId: string, 
    isFirstSegment: boolean 
}) => {
    const { createEmptySegmentBefore } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();

    // Only show for the first segment
    if (!options.editable || !isFirstSegment) return null;

    return (
        <div className="w-full h-2 group relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 bg-white hover:bg-gray-100"
                            onClick={() => createEmptySegmentBefore(segmentId)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add segment before
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Add a new empty segment before the first segment</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};

// Update SpeakerSegment component to include the new button
const SpeakerSegment = React.memo(({ segment, renderMock, isFirstSegment }: { 
    segment: TranscriptType[number], 
    renderMock: boolean,
    isFirstSegment?: boolean 
}) => {
    // ... existing component logic

    return (
        <>
            {/* Add the new button before the segment */}
            {options.editable && isFirstSegment && !renderMock && (
                <AddSegmentBeforeButton segmentId={segment.id} isFirstSegment={true} />
            )}
            
            {/* Existing segment content */}
            <div className='my-6 flex flex-col items-start w-full rounded-r-lg hover:bg-accent/5 transition-colors' style={{ borderLeft: `4px solid ${memoizedData.borderColor}` }}>
                {/* ... existing segment content */}
            </div>
            
            {/* Existing "Add After" button */}
            {options.editable && (
                renderMock ? (
                    <div className="w-full h-2" />
                ) : (
                    <AddSegmentButton segmentId={segment.id} />
                )
            )}
            
            {/* ... rest of component */}
        </>
    );
});
```

**Update**: `Transcript.tsx`

```typescript
// Update the segment rendering to pass isFirstSegment prop
{displayedSegments.map((segment, index: number) => {
    const shouldRender = visibleSegments.has(index) ||
        visibleSegments.has(index - 1) ||
        visibleSegments.has(index + 1);

    return (
        <div
            key={index}
            id={`speaker-segment-${index}`}
        >
            <SpeakerSegment
                segment={segment}
                renderMock={!shouldRender}
                isFirstSegment={index === 0}
            />
        </div>
    );
})}
```

## **Implementation Strategy**

### **Phase 1: Core Database Function**
1. Implement `createEmptySpeakerSegmentBefore()` in `src/lib/db/speakerSegments.ts`
2. Add comprehensive timestamp validation for first segment edge cases
3. Include proper error handling and authorization checks

### **Phase 2: Context Integration** 
1. Update `CouncilMeetingDataContext` interface and implementation
2. Add state management for new segment insertion at the beginning
3. Ensure proper transcript array manipulation

### **Phase 3: UI Implementation**
1. Create `AddSegmentBeforeButton` component
2. Integrate with existing `SpeakerSegment` component
3. Update `Transcript.tsx` to pass `isFirstSegment` prop
4. Add conditional rendering logic for first segment only

### **Phase 4: Testing & Validation**
1. Test timestamp edge cases (first segment at timestamp 0, very small timestamps)
2. Validate authorization and permission handling
3. Ensure UI responsiveness and proper state updates

## **Edge Cases & Considerations**

1. **First Segment at Timestamp 0**: Handle cases where the first segment starts at or very close to timestamp 0
2. **Insufficient Timestamp Space**: Error handling when there's not enough time before the first segment
3. **Empty Transcript**: Consider behavior when transcript has no existing segments (though this should be rare)
4. **Authorization**: Ensure consistent permission checking across all segment operations
5. **UI State**: Ensure the button appears/disappears correctly when segments are added or removed

## **Success Criteria**

1. **Functional**: Administrators can successfully create empty segments before the first segment
2. **Data Integrity**: No timestamp conflicts or overlaps in the transcript
3. **User Experience**: Clear UI indication that this adds content "before" the transcript
4. **Performance**: No degradation in transcript loading or rendering performance
5. **Consistency**: Feature follows existing patterns and maintains code quality standards
6. **Edge Case Handling**: Graceful handling of edge cases like first segment starting at timestamp 0

## **Files to Modify**

1. **`src/lib/db/speakerSegments.ts`** - Add `createEmptySpeakerSegmentBefore()` function
2. **`src/components/meetings/CouncilMeetingDataContext.tsx`** - Add context method and state management
3. **`src/components/meetings/transcript/SpeakerSegment.tsx`** - Add UI button and logic
4. **`src/components/meetings/transcript/Transcript.tsx`** - Pass `isFirstSegment` prop

## **Dependencies**

- Existing `createEmptySegmentAfter()` function for pattern reference
- `withUserAuthorizedToEdit()` for authorization
- Existing speaker tag and segment management patterns
- Current UI component structure and styling

---

This feature provides a focused solution for the specific use case of adding content before the first segment while maintaining simplicity and consistency with existing patterns. 
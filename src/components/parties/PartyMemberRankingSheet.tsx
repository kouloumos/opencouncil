"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PersonWithRelations } from '@/lib/db/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { Role } from '@prisma/client';
import { GripVertical, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PartyMemberRankingSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    party: PartyWithPersons;
    people: PersonWithRelations[];
    cityId: string;
}

interface SortableMember {
    personId: string;
    roleId: string;
    name: string;
    rank: number | null;
}

function SortableMemberRow({ member, index }: { member: SortableMember; index: number }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: member.roleId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 border rounded-lg bg-card"
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            >
                <GripVertical className="h-5 w-5" />
            </div>
            <div className="flex-1">
                <div className="font-medium">{member.name}</div>
                {member.rank !== null && (
                    <div className="text-sm text-muted-foreground">Rank: {member.rank}</div>
                )}
            </div>
            <div className="text-sm text-muted-foreground">#{index + 1}</div>
        </div>
    );
}

export default function PartyMemberRankingSheet({
    open,
    onOpenChange,
    party,
    people,
    cityId,
}: PartyMemberRankingSheetProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [members, setMembers] = useState<SortableMember[]>([]);

    // Initialize members from people data
    useEffect(() => {
        const activePeople = people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                (!role.endDate || new Date(role.endDate) > new Date())
            )
        );

        const membersData: SortableMember[] = activePeople
            .flatMap(person => {
                const partyRole = person.roles.find(role => role.partyId === party.id);
                if (!partyRole) return [];
                return [{
                    personId: person.id,
                    roleId: partyRole.id,
                    name: person.name,
                    rank: partyRole.rank ?? null,
                }];
            })
            .sort((a, b) => {
                // Sort by rank first (ascending, nulls last), then by name
                if (a.rank !== null && b.rank !== null) {
                    return a.rank - b.rank;
                }
                if (a.rank !== null) return -1;
                if (b.rank !== null) return 1;
                return a.name.localeCompare(b.name);
            });

        setMembers(membersData);
    }, [people, party.id]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setMembers((items) => {
                const oldIndex = items.findIndex(item => item.roleId === active.id);
                const newIndex = items.findIndex(item => item.roleId === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setIsClearing(false);
        try {
            const rankings = members.map((member, index) => ({
                roleId: member.roleId,
                rank: index + 1,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/parties/${party.id}/roles/ranking`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to save rankings');
            }

            toast({
                title: 'Rankings saved',
                description: 'Member rankings have been updated successfully.',
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error saving rankings:', error);
            toast({
                title: 'Error',
                description: 'Failed to save rankings. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = async () => {
        setIsClearing(true);
        setIsSaving(false);
        try {
            const rankings = members.map((member) => ({
                roleId: member.roleId,
                rank: null,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/parties/${party.id}/roles/ranking`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to clear rankings');
            }

            toast({
                title: 'Rankings cleared',
                description: 'All member rankings have been cleared.',
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error clearing rankings:', error);
            toast({
                title: 'Error',
                description: 'Failed to clear rankings. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsClearing(false);
        }
    };

    const isLoading = isSaving || isClearing;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Change Member Ordering</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Drag and drop members to reorder them. The order will be saved as rankings.
                    </p>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={members.map(m => m.roleId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {members.map((member, index) => (
                                    <SortableMemberRow
                                        key={member.roleId}
                                        member={member}
                                        index={index}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <div className="flex gap-2 pt-4">
                        <Button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="flex-1"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Ranking'
                            )}
                        </Button>
                        <Button
                            onClick={handleClear}
                            disabled={isLoading}
                            variant="outline"
                            className="flex-1"
                        >
                            {isClearing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Clearing...
                                </>
                            ) : (
                                'Clear Ranking'
                            )}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}


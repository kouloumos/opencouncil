"use client"
import React, { useEffect } from 'react';
import { TaskStatus } from '@prisma/client';
import { useToast } from '@/hooks/use-toast';
import TaskList from '@/components/meetings/admin/TaskList';
import { getTasksForWorkspace } from '@/lib/db/tasks';

interface WorkspaceTasksAdminProps {
  workspaceId: string;
}

export default function WorkspaceTasksAdmin({ workspaceId }: WorkspaceTasksAdminProps) {
  const { toast } = useToast();
  const [taskStatuses, setTaskStatuses] = React.useState<TaskStatus[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = React.useState(true);

  const fetchTaskStatuses = React.useCallback(async () => {
    try {
      const tasks = await getTasksForWorkspace(workspaceId);
      setTaskStatuses(tasks);
    } catch (error) {
      console.error('Error fetching task statuses:', error);
      toast({
        title: "Error fetching task statuses",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingTasks(false);
    }
  }, [workspaceId, toast]);

  React.useEffect(() => {
    fetchTaskStatuses();
    const intervalId = setInterval(fetchTaskStatuses, 3000);
    return () => clearInterval(intervalId);
  }, [fetchTaskStatuses]);

  const handleDeleteTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/taskStatuses/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete task');
      }

      toast({
        title: "Task deleted",
        description: `Task ${taskId} has been successfully deleted.`,
      });

      // Refresh task statuses after deletion
      fetchTaskStatuses();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: "Error deleting task",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      });
    }
  };

  return (
    <div>
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Task Statuses</h3>
        <TaskList tasks={taskStatuses} onDelete={handleDeleteTask} isLoading={isLoadingTasks} />
      </div>
    </div>
  );
}


'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import type { RefObject } from 'react';
import { api, apiBaseUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type { TaskAttachment } from '@/lib/types';
import { Button } from '@/components/ui/button';

export function TaskDetailAttachmentsSection({
  taskId,
  attachmentsSectionRef,
  onAuditChanged,
}: {
  taskId: string;
  attachmentsSectionRef: RefObject<HTMLElement | null>;
  onAuditChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const attachmentsQuery = useQuery<TaskAttachment[]>({
    queryKey: queryKeys.taskAttachments(taskId),
    queryFn: () => api(`/tasks/${taskId}/attachments`),
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
      await onAuditChanged();
    },
  });

  const attachments = attachmentsQuery.data ?? [];
  if (!attachments.length) return null;

  return (
    <section ref={attachmentsSectionRef} className="space-y-2 border-b border-border/50 pb-4">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Paperclip className="h-4 w-4" /> {t('attachments')}
      </div>
      <div className="space-y-1">
        {attachments.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-1 py-1 text-sm" data-testid={`attachment-${item.id}`}>
            <a href={`${apiBaseUrl}${item.url}`} target="_blank" rel="noreferrer" className="truncate hover:underline">
              {item.fileName}
            </a>
            <Button size="sm" variant="ghost" onClick={() => deleteAttachment.mutate(item.id)}>
              {t('delete')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, User, MessageSquare, Stamp } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Task, TaskApproval } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';

type ApprovalSectionProps = {
  task: Task;
  currentUserId: string;
  isProjectAdmin: boolean;
};

export function ApprovalSection({ task, currentUserId, isProjectAdmin }: ApprovalSectionProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isRequesting, setIsRequesting] = useState(false);
  const [approverId, setApproverId] = useState('');
  const [comment, setComment] = useState('');

  const approvalQuery = useQuery<TaskApproval | null>({
    queryKey: queryKeys.taskApproval(task.id),
    queryFn: () => api(`/tasks/${task.id}/approval`),
    enabled: task.type === 'APPROVAL',
  });

  const requestApproval = useMutation({
    mutationFn: (data: { approverUserId: string; comment?: string }) =>
      api(`/tasks/${task.id}/request-approval`, { method: 'POST', body: data }) as Promise<TaskApproval>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskApproval(task.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(task.id) });
      setIsRequesting(false);
      setApproverId('');
      setComment('');
    },
  });

  const respondApproval = useMutation({
    mutationFn: (data: { status: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      api(`/tasks/${task.id}/respond-approval`, { method: 'POST', body: data }) as Promise<TaskApproval>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskApproval(task.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(task.id) });
      setComment('');
    },
  });

  const cancelApproval = useMutation({
    mutationFn: () => api(`/tasks/${task.id}/cancel-approval`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.taskApproval(task.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(task.id) });
    },
  });

  if (task.type !== 'APPROVAL') {
    return null;
  }

  const approval = approvalQuery.data;
  const isApprover = approval?.approverUserId === currentUserId;
  const canRespond = approval?.status === 'PENDING' && (isApprover || isProjectAdmin);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'REJECTED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-amber-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return t('approvalApproved');
      case 'REJECTED':
        return t('approvalRejected');
      default:
        return t('approvalPending');
    }
  };

  return (
    <section className="space-y-3 border-b border-border/50 pb-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Stamp className="h-4 w-4" />
        <span>{t('approval')}</span>
      </div>

      {!approval ? (
        <div className="space-y-3">
          {!isRequesting ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRequesting(true)}
              className="w-full"
            >
              {t('requestApproval')}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('approver')}</label>
                <Input
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  placeholder="User ID"
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('approvalComment')}</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('approvalCommentPlaceholder')}
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRequesting(false)}
                  className="flex-1"
                >
                  {t('cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => requestApproval.mutate({ approverUserId: approverId, comment })}
                  disabled={!approverId.trim() || requestApproval.isPending}
                  className="flex-1"
                >
                  {requestApproval.isPending ? t('sending') : t('requestApproval')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="flex items-center gap-3">
              {getStatusIcon(approval.status)}
              <div>
                <div className="font-medium">{getStatusLabel(approval.status)}</div>
                {approval.approver && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{approval.approver.displayName || approval.approver.id}</span>
                  </div>
                )}
              </div>
            </div>
            {approval.status === 'PENDING' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelApproval.mutate()}
                disabled={cancelApproval.isPending}
              >
                {t('cancelApproval')}
              </Button>
            )}
          </div>

          {approval.comment && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4 mt-0.5" />
              <span>{approval.comment}</span>
            </div>
          )}

          {canRespond && (
            <div className="space-y-3 pt-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('approvalCommentPlaceholder')}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => respondApproval.mutate({ status: 'REJECTED', comment })}
                  disabled={respondApproval.isPending}
                  className="flex-1"
                >
                  {t('reject')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => respondApproval.mutate({ status: 'APPROVED', comment })}
                  disabled={respondApproval.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {t('approve')}
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <div>{t('requestedAt')}: {new Date(approval.requestedAt).toLocaleString()}</div>
            {approval.respondedAt && (
              <div>{t('respondedAt')}: {new Date(approval.respondedAt).toLocaleString()}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

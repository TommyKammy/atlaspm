UPDATE "inbox_notifications"
SET "type" = 'approval_requested'
WHERE "type" = 'APPROVAL_REQUESTED';

UPDATE "inbox_notifications"
SET "type" = 'approval_approved'
WHERE "type" = 'APPROVAL_APPROVED';

UPDATE "inbox_notifications"
SET "type" = 'approval_rejected'
WHERE "type" = 'APPROVAL_REJECTED';

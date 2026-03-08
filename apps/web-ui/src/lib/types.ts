export type Project = { id: string; workspaceId: string; name: string };

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  role: 'WS_ADMIN' | 'WS_MEMBER';
};

export type WorkspaceUserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  lastSeenAt?: string | null;
  createdAt: string;
  workspaceRole: 'WS_ADMIN' | 'WS_MEMBER';
  invitationStatus?: 'PENDING' | null;
  invitationId?: string;
  invitationExpiresAt?: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: 'WS_ADMIN' | 'WS_MEMBER';
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type Section = {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isDefault: boolean;
};

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';

export type CustomFieldOption = {
  id: string;
  label: string;
  value: string;
  color?: string | null;
  position: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomFieldDefinition = {
  id: string;
  projectId: string;
  name: string;
  type: CustomFieldType;
  description?: string | null;
  required: boolean;
  position: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  options: CustomFieldOption[];
};

export type TaskCustomFieldValue = {
  id: string;
  taskId: string;
  fieldId: string;
  optionId?: string | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | null;
  valueBoolean?: boolean | null;
  field?: {
    id: string;
    name: string;
    type: CustomFieldType;
    required?: boolean;
    position?: number;
  } | null;
  option?: {
    id: string;
    label: string;
    value: string;
    color?: string | null;
  } | null;
};

export type TaskType = 'TASK' | 'MILESTONE' | 'APPROVAL';

export type TaskApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type TaskApproval = {
  id: string;
  taskId: string;
  status: TaskApprovalStatus;
  approverUserId?: string | null;
  comment?: string | null;
  requestedAt: string;
  respondedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  approver?: {
    id: string;
    displayName?: string | null;
  } | null;
};

export type TimelineSubtaskMovePolicy = {
  mode: 'preserve';
  descendantCount: number;
  largeImpact: boolean;
};

export type Task = {
  id: string;
  projectId: string;
  sectionId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  descriptionDoc?: Record<string, unknown> | null;
  descriptionText?: string | null;
  descriptionUpdatedAt?: string | null;
  descriptionVersion?: number;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  type: TaskType;
  progressPercent: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  baselineDueAt?: string | null;
  baselineStartAt?: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  version: number;
  position: number;
  tags?: string[];
  recurringRuleId?: string | null;
  subtaskMovePolicy?: TimelineSubtaskMovePolicy;
  customFieldValues?: TaskCustomFieldValue[];
  approval?: TaskApproval | null;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  author?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  };
};

export type TaskMention = {
  id: string;
  taskId: string;
  mentionedUserId: string;
  sourceType: 'description' | 'comment';
  sourceId: string;
  createdAt: string;
  user?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  uploaderUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
  completedAt?: string | null;
  deletedAt?: string | null;
};

export type TaskReminder = {
  id: string;
  taskId: string;
  userId: string;
  remindAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  sentAt?: string | null;
};

export type InboxNotificationType =
  | 'mention'
  | 'assignment'
  | 'due_date'
  | 'status'
  | 'comment'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected';

export type InboxNotification = {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  type: InboxNotificationType;
  sourceType: 'description' | 'comment' | 'task';
  sourceId: string;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
  };
  task: {
    id: string;
    title: string;
    deletedAt?: string | null;
  };
  triggeredBy?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
};

export type AuditEvent = {
  id: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  correlationId: string;
  createdAt: string;
};

export type SectionTaskGroup = {
  section: Section;
  tasks: Task[];
};

export type ProjectMember = {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  user: {
    id: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
};

type RuleNumericOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between';

export type RuleCondition =
  | {
      field: 'progressPercent';
      op: RuleNumericOperator;
      value?: number;
      min?: number;
      max?: number;
    }
  | {
      field: 'customFieldNumber';
      fieldId: string;
      op: RuleNumericOperator;
      value?: number;
      min?: number;
      max?: number;
};

export type TaskProjectLink = {
  id: string;
  taskId: string;
  projectId: string;
  isPrimary: boolean;
  project: {
    id: string;
    name: string;
    workspaceId: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type RuleAction =
  | { type: 'setStatus'; status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' }
  | { type: 'setCompletedAtNow' }
  | { type: 'setCompletedAtNull' };

export type RuleDefinition = {
  trigger: 'task.progress.changed';
  logicalOperator?: 'AND' | 'OR';
  conditions: RuleCondition[];
  actions: RuleAction[];
};

export type Rule = {
  id: string;
  projectId: string;
  name: string;
  templateKey: string;
  enabled: boolean;
  cooldownSec: number;
  definition?: RuleDefinition;
  createdAt: string;
};


// Subtask types
export type Subtask = Task & {
  parentId: string | null;
  depth: number;
};

export type TaskBreadcrumb = {
  id: string;
  title: string;
  depth: number;
};

export type TaskTree = Task & {
  parentId: string | null;
  children: TaskTree[];
};

// Dependency types
export type DependencyType = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO';

export type TaskDependency = {
  id: string;
  taskId: string;
  dependsOnId: string;
  type: DependencyType;
  createdAt: string;
  dependsOnTask?: Task;
};

export type BlockedStatus = {
  isBlocked: boolean;
  blockers: TaskDependency[];
};

export type DependencyGraphNode = {
  id: string;
  title: string;
  status: Task['status'];
  x?: number;
  y?: number;
};

export type DependencyGraphEdge = {
  source: string;
  target: string;
  type: DependencyType;
};

export type DependencyGraph = {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
};



// Search types
export type TaskSearchHit = {
  objectID: string;
  title: string;
  description?: string | null;
  customFieldText?: string | null;
  projectId: string;
  assigneeId?: string | null;
  status: Task['status'];
  priority?: Task['priority'];
  dueAt?: string | null;
  startAt?: string | null;
  tags: string[];
  parentId?: string | null;
  depth: number;
  createdAt: string;
  updatedAt: string;
  _highlightResult?: {
    title?: { value: string };
    description?: { value: string };
  };
};

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type RecurringRule = {
  id: string;
  projectId: string;
  sourceTaskId?: string | null;
  title: string;
  description?: string | null;
  frequency: RecurringFrequency;
  interval: number;
  daysOfWeek: number[];
  dayOfMonth?: number | null;
  sectionId: string;
  assigneeUserId?: string | null;
  priority?: Task['priority'];
  tags: string[];
  startDate: string;
  endDate?: string | null;
  lastGeneratedAt?: string | null;
  nextScheduledAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tasks: number;
    generations: number;
  };
};

export type ProjectStatusHealth = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';

export type ProjectStatusUpdate = {
  id: string;
  projectId: string;
  authorUserId: string;
  health: ProjectStatusHealth;
  summary: string;
  blockers: string[];
  nextSteps: string[];
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  };
};

export type ProjectStatusUpdateList = {
  items: ProjectStatusUpdate[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export type FormQuestionType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'EMAIL' | 'SELECT' | 'MULTI_SELECT' | 'DATE' | 'CHECKBOX';

export type FormQuestionOption = {
  label: string;
  value: string;
};

export type FormQuestion = {
  id: string;
  formId: string;
  type: FormQuestionType;
  label: string;
  description?: string | null;
  required: boolean;
  options?: FormQuestionOption[] | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Form = {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  isPublic: boolean;
  publicToken?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  questions?: FormQuestion[];
  _count?: {
    questions: number;
    submissions: number;
  };
};

export type FormAnswerInput = {
  questionId: string;
  value: string | number | boolean | string[];
};

export type FormSubmission = {
  id: string;
  formId: string;
  submitterName: string;
  submitterEmail: string;
  createdTaskId?: string | null;
  createdAt: string;
  answers?: {
    questionId: string;
    questionLabel: string;
    value: string | number | boolean | string[];
  }[];
};

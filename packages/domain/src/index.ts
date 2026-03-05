export const DOMAIN_VERSION = '0.1.0';

export * from './entities/task.js';
export * from './errors/domain-error.js';
export * from './events/task-events.js';
export * from './ports/task-lifecycle-repository.js';
export * from './ports/task-repository.js';
export * from './ports/unit-of-work.js';
export * from './services/complete-task-lifecycle.js';
export * from './services/timeline-interaction.js';
export * from './services/task-completion-transition.js';
export * from './services/task-progress-automation.js';
export * from './services/task-progress-normalization.js';
export * from './value-objects/progress-percent.js';
export * from './value-objects/task-status.js';
export * from './value-objects/task-type.js';

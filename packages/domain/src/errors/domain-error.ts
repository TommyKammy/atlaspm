export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class DomainNotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class DomainConflictError extends DomainError {
  constructor(
    message: string,
    public readonly code: string = 'CONFLICT',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

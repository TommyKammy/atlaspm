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

import { DomainValidationError } from '../errors/domain-error.js';

export class ProgressPercent {
  private constructor(public readonly value: number) {}

  static from(value: number): ProgressPercent {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new DomainValidationError(`Progress percent must be an integer between 0 and 100. Received: ${value}`);
    }
    return new ProgressPercent(value);
  }
}

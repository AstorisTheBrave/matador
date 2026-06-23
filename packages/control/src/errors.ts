export class UnknownQueueError extends Error {
  readonly code = 'UNKNOWN_QUEUE';
  constructor(name: string) {
    super(`Unknown queue: ${name}`);
    this.name = 'UnknownQueueError';
  }
}

export class ConfirmRequiredError extends Error {
  readonly code = 'CONFIRM_REQUIRED';
  constructor(name: string) {
    super(`This destructive action requires confirm="${name}".`);
    this.name = 'ConfirmRequiredError';
  }
}

import type { EmailMessage, EmailSender } from '@kerykes/notifications';

/** Keeps what would have been sent; `failures` makes the next sends throw. */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failures = 0;

  send(message: EmailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error('SMTP server said no'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

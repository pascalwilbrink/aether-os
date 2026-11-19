import { createTransport, type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one email (docs/notifications.md, Delivery). Throws when the
 * server refuses it or can't be reached; `EmailDispatcher` retries. An
 * interface, so production can use Resend's or SES's API and tests a fake.
 */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}

/** Through an SMTP server: Mailpit locally; Resend and SES offer SMTP too. */
export class SmtpEmailSender extends EmailSender {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport(url);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** No email (`EMAIL_DRIVER=none`): deliveries are recorded as skipped instead. */
export class NoEmailSender extends EmailSender {
  send(): Promise<void> {
    return Promise.reject(new Error('Email is turned off'));
  }
}

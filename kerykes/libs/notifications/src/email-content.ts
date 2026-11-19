import type { EmailMessage } from './email-sender.js';
import type { NotificationEntity } from './notification.entities.js';

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A notification as an email (docs/notifications.md, Content): its title
 * and text, and one link, to Iris. Nothing in it acts by being opened.
 */
export function emailFor(
  notification: Pick<NotificationEntity, 'title' | 'body' | 'link'>,
  to: string,
  irisUrl: string,
): EmailMessage {
  const url = new URL(notification.link, irisUrl).toString();
  const footer =
    'You get this because of your role in Aether-os. Your inbox in Aether-os shows everything that concerns you.';
  return {
    to,
    subject: `[Aether-os] ${notification.title}`,
    text: `${notification.body}\n\nOpen in Aether-os: ${url}\n\n--\n${footer}\n`,
    html:
      `<p>${escape(notification.body)}</p>` +
      `<p><a href="${escape(url)}">Open in Aether-os</a></p>` +
      `<hr><p style="color:#71717a;font-size:12px">${escape(footer)}</p>`,
  };
}

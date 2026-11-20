/** One server-sent event: its `event` name (if any) and its `data` lines joined. */
export interface ServerSentEvent {
  event: string | null;
  data: string;
}

/**
 * Splits a stream of server-sent events (text/event-stream) into events, as
 * chunks arrive: `push` takes the next decoded text and returns the events
 * it completed; whatever is left waits for the next chunk.
 */
export class SseParser {
  private buffer = '';

  push(text: string): ServerSentEvent[] {
    this.buffer += text.replace(/\r\n?/g, '\n');
    const events: ServerSentEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const event = parseBlock(block);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  /** The last event, if the stream ended without a blank line after it. */
  end(): ServerSentEvent[] {
    const event = parseBlock(this.buffer);
    this.buffer = '';
    return event ? [event] : [];
  }
}

function parseBlock(block: string): ServerSentEvent | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

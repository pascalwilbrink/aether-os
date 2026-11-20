import { SseParser } from './sse.js';

describe('SseParser', () => {
  it('splits events however the chunks fall', () => {
    const parser = new SseParser();
    expect(parser.push('event: a\ndata: {"x":')).toEqual([]);
    expect(parser.push('1}\n\ndata: 2\r\n\r\ndata: [DONE]')).toEqual([
      { event: 'a', data: '{"x":1}' },
      { event: null, data: '2' },
    ]);
    expect(parser.end()).toEqual([{ event: null, data: '[DONE]' }]);
  });

  it('joins data lines and skips comments', () => {
    const parser = new SseParser();
    expect(parser.push(': ping\n\ndata: a\ndata: b\n\n')).toEqual([
      { event: null, data: 'a\nb' },
    ]);
  });
});

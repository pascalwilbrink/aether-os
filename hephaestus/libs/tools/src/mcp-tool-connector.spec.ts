import { toolKey } from './mcp-tool-connector.js';

describe('toolKey', () => {
  it('names a tool <server>_<tool>, in what providers accept', () => {
    expect(toolKey('docs', 'lookup')).toBe('docs_lookup');
    expect(toolKey('docs', 'search.v2')).toBe('docs_search_v2');
    expect(toolKey('seshat', 'x'.repeat(80))).toHaveLength(64);
  });
});

import { FakeToolServer } from '../../../test/fake-tool-server.js';
import { McpToolConnector } from './mcp-tool-connector.js';
import { ToolServerUnavailableError } from './tool-server.errors.js';

describe('McpToolConnector (a real MCP server)', () => {
  let server: FakeToolServer;
  const connector = new McpToolConnector({
    allowPrivate: true,
    timeoutMs: 5000,
  });

  beforeEach(async () => {
    server = await new FakeToolServer().start();
  });
  afterEach(async () => {
    await server.stop();
  });

  it('lists what a server offers', async () => {
    await expect(
      connector.describe({ name: 'docs', url: server.url, headers: {} }),
    ).resolves.toEqual([
      { name: 'lookup', description: 'Looks a term up' },
      { name: 'shout', description: 'Uppercases text' },
    ]);
  });

  it('connects the chosen tools as <server>_<tool>, sending the headers', async () => {
    const connected = await connector.connect([
      {
        name: 'docs',
        url: server.url,
        headers: { 'X-Api-Key': 'secret-1234' },
        tools: ['lookup'],
      },
    ]);
    try {
      expect(Object.keys(connected.tools)).toEqual(['docs_lookup']);
      const result = await connected.tools.docs_lookup.execute!(
        { term: 'Aether' },
        {} as never,
      );
      expect(JSON.stringify(result)).toContain('Aether is a test');
    } finally {
      await connected.close();
    }
    expect(server.requests.length).toBeGreaterThan(0);
    expect(server.requests.every((h) => h['x-api-key'] === 'secret-1234')).toBe(
      true,
    );
  });

  it("fails without retrying for a tool the server doesn't offer", async () => {
    const failure = await connector
      .connect([
        { name: 'docs', url: server.url, headers: {}, tools: ['missing'] },
      ])
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ToolServerUnavailableError);
    expect(failure).toMatchObject({
      retryable: false,
      message: "Tool server docs doesn't offer missing",
    });
  });

  it('fails, to be retried, when the server refuses or is gone', async () => {
    server.refuse = true;
    await expect(
      connector.connect([{ name: 'docs', url: server.url, headers: {} }]),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("doesn't connect to a private address unless allowed", async () => {
    const guarded = new McpToolConnector({
      allowPrivate: false,
      timeoutMs: 5000,
    });
    await expect(
      guarded.connect([{ name: 'docs', url: server.url, headers: {} }]),
    ).rejects.toBeInstanceOf(ToolServerUnavailableError);
    expect(server.requests).toHaveLength(0);
  });
});

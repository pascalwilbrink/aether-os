import { isPrivateAddress } from '@hephaestus/core';

import { toolServerProblem } from './tool-server-policy.js';

const strict = {
  allowPrivate: false,
  trustedOrigins: ['https://seshat.example.com'],
};
const local = { allowPrivate: true, trustedOrigins: [] };

describe('toolServerProblem', () => {
  it('takes a public https server', () => {
    expect(
      toolServerProblem('https://tools.example.com/mcp', 'none', strict),
    ).toBeNull();
    expect(
      toolServerProblem('https://tools.example.com/mcp', 'header', strict),
    ).toBeNull();
  });

  it('wants https, unless private addresses are allowed', () => {
    expect(
      toolServerProblem('http://tools.example.com/mcp', 'none', strict),
    ).toBe('A tool server is reached over https.');
    expect(toolServerProblem('ftp://tools.example.com', 'none', local)).toBe(
      'A tool server is reached over https.',
    );
    expect(
      toolServerProblem('http://localhost:3200/mcp', 'none', local),
    ).toBeNull();
  });

  it('refuses private and loopback addresses written into the URL', () => {
    for (const url of [
      'https://localhost/mcp',
      'https://127.0.0.1/mcp',
      'https://169.254.169.254/latest',
      'https://10.1.2.3/mcp',
      'https://[::1]/mcp',
      'https://[fd00::1]/mcp',
    ]) {
      expect(toolServerProblem(url, 'none', strict)).toContain('private');
    }
  });

  it('refuses credentials in the URL', () => {
    expect(
      toolServerProblem('https://a:b@tools.example.com/mcp', 'none', strict),
    ).toContain("can't hold credentials");
  });

  it("sends a task's token only to a trusted origin", () => {
    expect(
      toolServerProblem('https://seshat.example.com/mcp', 'task-token', strict),
    ).toBeNull();
    expect(
      toolServerProblem(
        'https://seshat.example.com:8443/mcp',
        'task-token',
        strict,
      ),
    ).toContain('TOOL_SERVER_TRUSTED_ORIGINS');
    expect(
      toolServerProblem('https://evil.example.com/mcp', 'task-token', strict),
    ).toContain('TOOL_SERVER_TRUSTED_ORIGINS');
  });
});

describe('isPrivateAddress', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['100.64.0.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['224.0.0.1', true],
    ['8.8.8.8', false],
    ['::1', true],
    ['::ffff:10.0.0.1', true],
    ['::ffff:8.8.8.8', false],
    ['fe80::1', true],
    ['fc00::1', true],
    ['2606:4700::1111', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

import type { ProxenosEvents } from '@kairos/core';

import {
  actionProblems,
  concurrencyKey,
  fieldsOf,
  match,
  render,
  storedTrigger,
} from './triggers.js';

const PROJECT = 'project-1';
const LINK = 'link-1';

const event = (
  overrides: Partial<ProxenosEvents.GithubIssueOpened> = {},
): ProxenosEvents.GithubIssueOpened => ({
  webhookDeliveryId: 'delivery-1',
  deliveryId: 'github-delivery-1',
  repositoryId: 'repository-1',
  repository: 'acme/api',
  projectIds: [PROJECT],
  links: [{ projectId: PROJECT, linkId: LINK }],
  number: 12,
  title: 'Login fails for uppercase emails',
  url: 'https://github.com/acme/api/issues/12',
  isPullRequest: false,
  labels: ['bug'],
  label: null,
  commentId: null,
  author: { login: 'ada', type: 'User' },
  authorPermission: 'write',
  fromAetherOs: false,
  ...overrides,
});

const opened = storedTrigger({
  type: 'github.issue',
  event: 'github.issue.opened',
});

describe('triggers', () => {
  it('fires for a trusted author in a linked repository, with its link', () => {
    expect(match(opened, 'github.issue.opened', event(), PROJECT)).toEqual({
      linkId: LINK,
    });
    // Another event, or a repository not linked to the project.
    expect(match(opened, 'github.issue.labeled', event(), PROJECT)).toBeNull();
    expect(match(opened, 'github.issue.opened', event(), 'other')).toBeNull();
  });

  it('only fires for collaborators with write access, by default', () => {
    for (const authorPermission of ['read', 'triage', 'none', null] as const) {
      expect(
        match(
          opened,
          'github.issue.opened',
          event({ authorPermission }),
          PROJECT,
        ),
      ).toBeNull();
    }
    expect(
      match(
        opened,
        'github.issue.opened',
        event({ authorPermission: 'admin' }),
        PROJECT,
      ),
    ).not.toBeNull();
    // Widened to anyone, even without access.
    const anyone = { ...opened, minimumPermission: 'any' as const };
    expect(
      match(
        anyone,
        'github.issue.opened',
        event({ authorPermission: null }),
        PROJECT,
      ),
    ).not.toBeNull();
  });

  it("ignores Aether-os's own bot and pull requests unless asked", () => {
    expect(
      match(
        opened,
        'github.issue.opened',
        event({ fromAetherOs: true }),
        PROJECT,
      ),
    ).toBeNull();
    expect(
      match(
        { ...opened, includeAetherOs: true },
        'github.issue.opened',
        event({ fromAetherOs: true }),
        PROJECT,
      ),
    ).not.toBeNull();
    expect(
      match(
        opened,
        'github.issue.opened',
        event({ isPullRequest: true }),
        PROJECT,
      ),
    ).toBeNull();
  });

  it('filters on the repository link and the label', () => {
    expect(
      match(
        { ...opened, repositoryLinkId: 'link-2' },
        'github.issue.opened',
        event(),
        PROJECT,
      ),
    ).toBeNull();
    expect(
      match(
        { ...opened, label: 'aether' },
        'github.issue.opened',
        event(),
        PROJECT,
      ),
    ).toBeNull();
    expect(
      match(
        { ...opened, label: 'bug' },
        'github.issue.opened',
        event(),
        PROJECT,
      ),
    ).not.toBeNull();
    // Labeled: the label added, not one the issue already had.
    const labeled = storedTrigger({
      type: 'github.issue',
      event: 'github.issue.labeled',
      label: 'aether',
    });
    expect(
      match(labeled, 'github.issue.labeled', event({ label: 'bug' }), PROJECT),
    ).toBeNull();
    expect(
      match(
        labeled,
        'github.issue.labeled',
        event({ label: 'aether', labels: ['bug', 'aether'] }),
        PROJECT,
      ),
    ).not.toBeNull();
  });

  it("fills in the event's fields", () => {
    expect(
      render(
        'Fix #{{ issue.number }} in {{repository}}: {{issue.title}} ({{author}}, {{issue.url}}) {{label}}',
        fieldsOf(event()),
      ),
    ).toBe(
      'Fix #12 in acme/api: Login fails for uppercase emails (ada, https://github.com/acme/api/issues/12) ',
    );
  });

  it("makes the automation's own concurrency key, hashing a long one", () => {
    const fields = fieldsOf(event());
    expect(
      concurrencyKey('a-1', '{{repository}}#{{issue.number}}', fields),
    ).toBe('a-1:acme/api#12');
    const long = concurrencyKey('a-1', '{{issue.title}}'.repeat(10), fields);
    expect(long).toMatch(/^a-1:[0-9a-f]{64}$/);
  });

  it('refuses an action with neither or both kinds, or unknown fields', () => {
    expect(actionProblems({ serviceAccountId: 'sa' })).toEqual([
      { pointer: '/action', detail: 'Give exactly one of task and template.' },
    ]);
    expect(
      actionProblems({
        serviceAccountId: 'sa',
        task: {
          agentId: 'a',
          title: '{{issue.title}}',
          instructions: '{{issue.body}}',
        },
        template: { templateId: 't', inputs: { issue: '{{nope}}' } },
      }).map((problem) => problem.pointer),
    ).toEqual([
      '/action',
      '/action/task/instructions',
      '/action/template/inputs/issue',
    ]);
  });
});

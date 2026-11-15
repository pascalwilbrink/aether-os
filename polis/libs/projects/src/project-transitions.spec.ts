import {
  nextProjectStatus,
  type ProjectAction,
  type ProjectStatus,
} from './project-transitions.js';

describe('project transitions', () => {
  it.each<[ProjectStatus, ProjectAction, ProjectStatus]>([
    ['active', 'archive', 'archived'],
    ['archived', 'archive', 'archived'],
  ])('%s --%s--> %s', (current, action, next) => {
    expect(nextProjectStatus(current, action)).toBe(next);
  });
});

import {
  nextUserStatus,
  userCanSignIn,
  type UserAction,
  type UserStatus,
} from './user-transitions.js';

describe('user transitions', () => {
  it.each<[UserStatus, UserAction, UserStatus]>([
    ['active', 'disable', 'disabled'],
    ['active', 'enable', 'active'],
    ['disabled', 'disable', 'disabled'],
    ['disabled', 'enable', 'active'],
  ])('%s --%s--> %s', (current, action, next) => {
    expect(nextUserStatus(current, action)).toBe(next);
  });

  it('lets only active users sign in', () => {
    expect(userCanSignIn('active')).toBe(true);
    expect(userCanSignIn('disabled')).toBe(false);
  });
});

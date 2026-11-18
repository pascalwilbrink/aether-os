import { FakeGitHub } from './fake-github.js';

/** This test file's GitHub (test/setup.ts points the app at it). */
export const github = await new FakeGitHub().start();

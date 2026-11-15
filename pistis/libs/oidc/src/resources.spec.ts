import {
  organizationOf,
  organizationResource,
  PLATFORM_RESOURCE,
  requestedResources,
} from './resources.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('resources', () => {
  it('maps resources to organizations', () => {
    expect(organizationOf(PLATFORM_RESOURCE)).toBeNull();
    expect(organizationOf(organizationResource(ORG))).toBe(ORG);
    expect(organizationOf('urn:aether-os:org:not-a-uuid')).toBeUndefined();
    expect(organizationOf('https://example.com')).toBeUndefined();
    expect(organizationOf(`${organizationResource(ORG)}x`)).toBeUndefined();
  });

  it('reads the requested resources, defaulting to the platform', () => {
    expect(requestedResources(undefined)).toEqual([PLATFORM_RESOURCE]);
    expect(requestedResources('urn:aether-os')).toEqual(['urn:aether-os']);
    expect(requestedResources(['a', 1, 'b'])).toEqual(['a', 'b']);
  });
});

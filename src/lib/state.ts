import { PPPC_PERMISSIONS } from './permissions';
import { generateRandomUUID } from './uuid';
import type {
  AppInfo,
  PermissionsState,
  SelectedApp,
} from './types';

function createDefaultPermissions(): PermissionsState {
  const perms: PermissionsState = {};
  for (const p of PPPC_PERMISSIONS) {
    perms[p.id] = {
      enabled: false,
      authorization: 'Allow',
    };
  }
  return perms;
}

export function makeAppEntry(
  appInfo: AppInfo,
  id: number,
  isFirst: boolean,
  isKnownApp: boolean,
): SelectedApp {
  return {
    id,
    app: appInfo,
    permissions: createDefaultPermissions(),
    expanded: isFirst,
    isKnownApp,
    profile: {
      name: `PPPC - ${appInfo.displayName}`,
      description: '',
      identifier: generateRandomUUID(),
      organization: '',
    },
    scopeTagIds: ['0'],
    deploymentChannel: 'deviceChannel',
  };
}

/** Sanitize a string into something safe for use as a filename.
 *  Falls back to 'profile' when the input contains only disallowed characters
 *  (e.g. non-Latin script), so generated filenames never collapse to '.mobileconfig'. */
export function safeFilename(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'profile';
}

export function totalEnabledPermissions(apps: SelectedApp[]): number {
  return apps.reduce(
    (sum, item) =>
      sum + Object.values(item.permissions).filter((p) => p.enabled).length,
    0,
  );
}

import { APP_PRIVACY_PERMISSIONS, PPPC_PERMISSIONS } from './permissions';
import { generateRandomUUID } from './uuid';
import type {
  AppInfo,
  Authorization,
  AuthMode,
  PermissionsState,
  SelectedApp,
} from './types';

/** Default Authorization value to seed a fresh permission row with. */
function defaultAuthFor(mode: AuthMode): Authorization {
  switch (mode) {
    case 'standard':
      return 'Allow';
    case 'denyOrStandardUser':
      return 'AllowStandardUserToSetSystemService';
    case 'denyOnly':
      return 'Deny';
  }
}

function createDefaultPermissions(): PermissionsState {
  const perms: PermissionsState = {};
  for (const p of PPPC_PERMISSIONS) {
    perms[p.id] = {
      enabled: false,
      authorization: defaultAuthFor(p.authMode),
      ...(p.tccService === 'AppleEvents' ? { receivers: [] } : {}),
    };
  }
  // macOS 27-only App Privacy ids (dictation, localNetwork, location). The
  // shared ids (camera, accessibility, …) reuse the PPPC state above.
  for (const p of APP_PRIVACY_PERMISSIONS) {
    perms[p.id] ??= { enabled: false, authorization: 'Allow' };
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
    privacyJustification: '',
  };
}

/** Sanitize a string into something safe for use as a filename, keeping it as close to
 *  the policy name as possible: only characters Windows/macOS reject become '-', and
 *  leading/trailing dots, spaces and dashes are trimmed. Falls back to 'profile' when nothing
 *  is left, so generated filenames never collapse to '.mobileconfig'. */
export function safeFilename(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^[\s.-]+|[\s.-]+$/g, '');
  return cleaned || 'profile';
}

export function totalEnabledPermissions(apps: SelectedApp[]): number {
  return apps.reduce(
    (sum, item) =>
      sum + Object.values(item.permissions).filter((p) => p.enabled).length,
    0,
  );
}

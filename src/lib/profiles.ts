import { generateMobileconfig } from './mobileconfig';
import {
  buildSettingsCatalogPolicy,
  serializeSettingsCatalogPolicy,
} from './settingsCatalog';
import { generateRandomUUID } from './uuid';
import { safeFilename, totalEnabledPermissions } from './state';
import type {
  DeploymentFormat,
  GeneratedProfile,
  OutputMode,
  ProfileSettings,
  SelectedApp,
} from './types';

function buildContent(
  apps: SelectedApp[],
  settings: ProfileSettings,
  format: DeploymentFormat,
  innerUUID?: string,
): { content: string; ext: 'mobileconfig' | 'json' } {
  if (format === 'classic') {
    return {
      content: generateMobileconfig(apps, settings, innerUUID),
      ext: 'mobileconfig',
    };
  }
  const policy = buildSettingsCatalogPolicy(apps, settings);
  // settingsCatalog produces null when no permissions enabled — the outer guard
  // in generateProfiles already returns [] in that case, so we won't reach here.
  return {
    content: policy ? serializeSettingsCatalogPolicy(policy) : '',
    ext: 'json',
  };
}

/**
 * Generate one or more deployment profiles depending on output mode and format.
 *
 * Output mode controls how many profiles are produced:
 *   - 'bundle'   : single profile containing all enabled apps
 *   - 'separate' : one profile per app, using each app's per-app metadata
 *
 * Deployment format controls the serialization shape:
 *   - 'classic'         : `.mobileconfig` plist for macOSCustomConfiguration
 *   - 'settingsCatalog' : JSON for the configurationPolicies Settings Catalog API
 */
export function generateProfiles(
  apps: SelectedApp[],
  shared: ProfileSettings,
  mode: OutputMode,
  format: DeploymentFormat,
  innerUUID?: string,
): GeneratedProfile[] {
  if (totalEnabledPermissions(apps) === 0) return [];

  if (mode === 'bundle') {
    const { content, ext } = buildContent(apps, shared, format, innerUUID);
    const appSegment = apps
      .map((a) => a.app.bundleId.split('.').pop())
      .filter(Boolean)
      .join('-');
    const baseName = shared.payloadName || `PPPC-${appSegment || 'profile'}`;
    return [
      {
        filename: `${safeFilename(baseName)}.${ext}`,
        policyName: shared.payloadName || `PPPC Configuration`,
        description: shared.payloadDescription,
        content,
        format,
        scopeTagIds: shared.scopeTagIds.length > 0 ? shared.scopeTagIds : ['0'],
        deploymentChannel: shared.deploymentChannel,
      },
    ];
  }

  // Separate: one profile per app that has at least one enabled permission.
  const out: GeneratedProfile[] = [];
  for (const app of apps) {
    if (totalEnabledPermissions([app]) === 0) continue;
    const perAppSettings: ProfileSettings = {
      organization: app.profile.organization || shared.organization,
      payloadName: app.profile.name || `PPPC - ${app.app.displayName}`,
      payloadIdentifier: app.profile.identifier,
      payloadDescription: app.profile.description || shared.payloadDescription,
      scopeTagIds: app.scopeTagIds,
      deploymentChannel: app.deploymentChannel,
    };
    const { content, ext } = buildContent(
      [app],
      perAppSettings,
      format,
      generateRandomUUID(),
    );
    out.push({
      filename: `${safeFilename(perAppSettings.payloadName)}.${ext}`,
      policyName: perAppSettings.payloadName,
      description: perAppSettings.payloadDescription,
      content,
      format,
      bundleId: app.app.bundleId,
      scopeTagIds: app.scopeTagIds.length > 0 ? app.scopeTagIds : ['0'],
      deploymentChannel: app.deploymentChannel,
    });
  }
  return out;
}

import { PPPC_PERMISSIONS } from './permissions';
import type {
  AppleEventReceiver,
  Authorization,
  AuthMode,
  ProfileSettings,
  SelectedApp,
} from './types';

/**
 * Build a Microsoft Intune Settings Catalog configuration-policy body for the
 * `com.apple.tcc.configuration-profile-policy` setting tree, as documented in
 * Microsoft Learn and produced by gilburns/Intune-PPPC-Utility.
 *
 * Returns the JSON-serializable object that goes in the body of:
 *   POST /beta/deviceManagement/configurationPolicies
 *
 * The same body shape is also what users can download as a .json file for
 * manual import into Intune.
 */

const ROOT_KEY = 'com.apple.tcc.configuration-profile-policy';
const ROOT_SETTING_ID = `${ROOT_KEY}_${ROOT_KEY}`;
const SERVICES_ID = `${ROOT_KEY}_services`;

const TYPE_GROUP_COLL = '#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance';
const TYPE_GROUP_SINGLE = '#microsoft.graph.deviceManagementConfigurationGroupSettingInstance';
const TYPE_CHOICE = '#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance';
const TYPE_SIMPLE = '#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance';
const TYPE_STRING_VALUE = '#microsoft.graph.deviceManagementConfigurationStringSettingValue';

/** Authorization → choice-value numeric suffix used by Microsoft's setting catalog. */
const AUTH_SUFFIX: Record<Authorization, '0' | '2' | '3'> = {
  Allow: '0',
  AllowStandardUserToSetSystemService: '2',
  Deny: '3',
};

const IDENTIFIER_TYPE_SUFFIX = {
  bundleID: '0',
  path: '1',
} as const;

type SettingInstance =
  | GroupCollectionInstance
  | GroupSingleInstance
  | ChoiceInstance
  | SimpleStringInstance;

interface GroupCollectionInstance {
  '@odata.type': typeof TYPE_GROUP_COLL;
  settingDefinitionId: string;
  groupSettingCollectionValue: Array<{ children: SettingInstance[] }>;
}

interface GroupSingleInstance {
  '@odata.type': typeof TYPE_GROUP_SINGLE;
  settingDefinitionId: string;
  groupSettingValue: { children: SettingInstance[] };
}

interface ChoiceInstance {
  '@odata.type': typeof TYPE_CHOICE;
  settingDefinitionId: string;
  choiceSettingValue: { value: string; children: SettingInstance[] };
}

interface SimpleStringInstance {
  '@odata.type': typeof TYPE_SIMPLE;
  settingDefinitionId: string;
  simpleSettingValue: { '@odata.type': typeof TYPE_STRING_VALUE; value: string };
}

export interface SettingsCatalogPolicy {
  name: string;
  description: string;
  platforms: 'macOS';
  technologies: 'mdm,appleRemoteManagement';
  roleScopeTagIds: string[];
  settings: Array<{
    '@odata.type': '#microsoft.graph.deviceManagementConfigurationSetting';
    settingInstance: SettingInstance;
  }>;
}

/** Lowercase identifier suffix Microsoft uses for each PPPC service. */
function serviceKey(tccService: string): string {
  return tccService.toLowerCase();
}

/** Clamp the requested Authorization to one macOS actually honours for this authMode. */
function effectiveAuthorization(mode: AuthMode, requested: Authorization): Authorization {
  switch (mode) {
    case 'standard':
      return requested;
    case 'denyOrStandardUser':
      return requested === 'Deny' ? 'Deny' : 'AllowStandardUserToSetSystemService';
    case 'denyOnly':
      return 'Deny';
  }
}

function defaultCodeRequirement(bundleId: string): string {
  return `identifier "${bundleId}" and anchor apple generic`;
}

function simple(settingDefinitionId: string, value: string): SimpleStringInstance {
  return {
    '@odata.type': TYPE_SIMPLE,
    settingDefinitionId,
    simpleSettingValue: { '@odata.type': TYPE_STRING_VALUE, value },
  };
}

function choice(settingDefinitionId: string, valueSuffix: string): ChoiceInstance {
  return {
    '@odata.type': TYPE_CHOICE,
    settingDefinitionId,
    choiceSettingValue: {
      value: `${settingDefinitionId}_${valueSuffix}`,
      children: [],
    },
  };
}

/** Field order matches gilburns/Intune-PPPC-Utility: AE-receiver first, then auth/codeReq/identifier/identifierType. */
function appEntryChildren(
  serviceId: string,
  bundleId: string,
  codeRequirement: string,
  authorization: Authorization,
  receiver?: AppleEventReceiver,
): SettingInstance[] {
  const children: SettingInstance[] = [];

  if (receiver) {
    children.push(
      simple(
        `${serviceId}_item_aereceivercoderequirement`,
        receiver.codeRequirement || defaultCodeRequirement(receiver.identifier),
      ),
      simple(`${serviceId}_item_aereceiveridentifier`, receiver.identifier),
      choice(
        `${serviceId}_item_aereceiveridentifiertype`,
        IDENTIFIER_TYPE_SUFFIX[receiver.identifierType],
      ),
    );
  }

  children.push(
    choice(`${serviceId}_item_authorization`, AUTH_SUFFIX[authorization]),
    simple(`${serviceId}_item_coderequirement`, codeRequirement),
    simple(`${serviceId}_item_identifier`, bundleId),
    choice(`${serviceId}_item_identifiertype`, IDENTIFIER_TYPE_SUFFIX.bundleID),
  );

  return children;
}

interface ServiceAppRow {
  bundleId: string;
  codeRequirement: string;
  authorization: Authorization;
  receiver?: AppleEventReceiver;
}

/**
 * Build the Settings Catalog policy body for one logical profile.
 * Returns null when no service entries would be emitted.
 */
export function buildSettingsCatalogPolicy(
  apps: SelectedApp[],
  settings: ProfileSettings,
): SettingsCatalogPolicy | null {
  // service tccName -> rows
  const rowsByService = new Map<string, ServiceAppRow[]>();

  for (const item of apps) {
    for (const [permId, state] of Object.entries(item.permissions)) {
      if (!state.enabled) continue;
      const perm = PPPC_PERMISSIONS.find((p) => p.id === permId);
      if (!perm) continue;
      const codeReq = item.app.codeRequirement || defaultCodeRequirement(item.app.bundleId);

      if (perm.tccService === 'AppleEvents') {
        const receivers = state.receivers ?? [];
        if (receivers.length === 0) continue;
        const list = rowsByService.get(perm.tccService) ?? [];
        for (const r of receivers) {
          list.push({
            bundleId: item.app.bundleId,
            codeRequirement: codeReq,
            authorization: r.authorization,
            receiver: r,
          });
        }
        rowsByService.set(perm.tccService, list);
        continue;
      }

      const list = rowsByService.get(perm.tccService) ?? [];
      list.push({
        bundleId: item.app.bundleId,
        codeRequirement: codeReq,
        authorization: effectiveAuthorization(perm.authMode, state.authorization),
      });
      rowsByService.set(perm.tccService, list);
    }
  }

  if (rowsByService.size === 0) return null;

  const serviceInstances: GroupCollectionInstance[] = [];
  for (const [tccName, rows] of rowsByService) {
    const serviceId = `${SERVICES_ID}_${serviceKey(tccName)}`;
    serviceInstances.push({
      '@odata.type': TYPE_GROUP_COLL,
      settingDefinitionId: serviceId,
      groupSettingCollectionValue: rows.map((row) => ({
        children: appEntryChildren(
          serviceId,
          row.bundleId,
          row.codeRequirement,
          row.authorization,
          row.receiver,
        ),
      })),
    });
  }

  const root: GroupCollectionInstance = {
    '@odata.type': TYPE_GROUP_COLL,
    settingDefinitionId: ROOT_SETTING_ID,
    groupSettingCollectionValue: [
      {
        children: [
          {
            '@odata.type': TYPE_GROUP_COLL,
            settingDefinitionId: SERVICES_ID,
            groupSettingCollectionValue: [{ children: serviceInstances }],
          },
        ],
      },
    ],
  };

  return {
    name: settings.payloadName || 'PPPC Configuration',
    description: settings.payloadDescription || '',
    platforms: 'macOS',
    technologies: 'mdm,appleRemoteManagement',
    roleScopeTagIds: settings.scopeTagIds.length > 0 ? settings.scopeTagIds : ['0'],
    settings: [
      {
        '@odata.type': '#microsoft.graph.deviceManagementConfigurationSetting',
        settingInstance: root,
      },
    ],
  };
}

/** Convenience: stringify policy with stable indentation for preview/download. */
export function serializeSettingsCatalogPolicy(policy: SettingsCatalogPolicy): string {
  return JSON.stringify(policy, null, 4);
}

// Marker so an unused-import lint doesn't trip on GroupSingleInstance during future expansion.
export type { GroupSingleInstance };

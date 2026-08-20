import { getVersion } from '@tauri-apps/api/app'
import packageJson from '../../../package.json'

export type SystemInfoStatus = 'matched' | 'mismatch' | 'unavailable'

export interface SystemInfo {
  appVersion: string
  hostVersion: string | null
  status: SystemInfoStatus
}

export interface SystemInfoService {
  load(): Promise<SystemInfo>
}

export function compareSystemVersions(appVersion: string, hostVersion: string | null): SystemInfo {
  const normalizedHostVersion = hostVersion?.trim() || null
  return {
    appVersion,
    hostVersion: normalizedHostVersion,
    status: normalizedHostVersion === null
      ? 'unavailable'
      : normalizedHostVersion === appVersion
        ? 'matched'
        : 'mismatch',
  }
}

export async function loadSystemInfo(): Promise<SystemInfo> {
  try {
    return compareSystemVersions(packageJson.version, await getVersion())
  } catch {
    return compareSystemVersions(packageJson.version, null)
  }
}

export const tauriSystemInfoService: SystemInfoService = {
  load: loadSystemInfo,
}

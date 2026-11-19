function getShortName(name) {
  if (!name) return 'SS'
  const trimmed = name.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  const capitals = trimmed.match(/[A-Z]/g)
  if (capitals && capitals.length >= 2) {
    return capitals.slice(0, 2).join('')
  }
  return trimmed.slice(0, 2).toUpperCase()
}

const rawName = import.meta.env.VITE_APP_NAME?.trim()
const appName = rawName || 'SmartStock'

export const APP_CONFIG = {
  name: appName,
  shortName: import.meta.env.VITE_APP_SHORT_NAME?.trim() || getShortName(appName),
  tagline: import.meta.env.VITE_APP_TAGLINE?.trim() || 'INVENTORY WORKSPACE',
  version:
    appName === 'SmartStock'
      ? 'SmartStock V2 · Tahap 1'
      : `${appName} · SmartStock V2`,
}

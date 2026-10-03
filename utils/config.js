// Library settings = values saved in the app (Settings screen)
// on top of .env defaults.
//
// No database import here, so it stays easy to test.
// utils/settings.js loads/saves the overrides.

let overrides = {}

export const setOverrides = (o) => {
  overrides = o || {}
}

const num = (v) =>
  v === undefined ||
  v === null ||
  v === '' ||
  !Number.isFinite(Number(v))
    ? null
    : Number(v)

const list = (s) =>
  String(s)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Number.isFinite)

export const cfg = () => {
  const envLat = num(process.env.LIBRARY_LAT)
  const envLng = num(process.env.LIBRARY_LNG)

  return {
    libraryName:
      overrides.libraryName ||
      process.env.LIBRARY_NAME ||
      'Study Library',

    address:
      overrides.address ??
      process.env.LIBRARY_ADDRESS ??
      '',

    phone: overrides.phone ?? '',

    closeTime:
      overrides.closeTime ||
      process.env.LIBRARY_CLOSE_TIME ||
      '22:00',

    qrRotateSeconds:
      num(overrides.qrRotateSeconds) ??
      num(process.env.QR_ROTATE_SECONDS) ??
      60,

    remindDays:
      overrides.remindDays?.length
        ? overrides.remindDays
        : list(process.env.REMIND_DAYS || '7,3,1,0'),

    geoEnabled:
      overrides.geoEnabled ??
      (envLat !== null && envLng !== null),

    geoLat:
      num(overrides.geoLat) ?? envLat,

    geoLng:
      num(overrides.geoLng) ?? envLng,

    geoMeters:
      num(overrides.geoMeters) ??
      num(process.env.GEOFENCE_METERS) ??
      150
  }
}
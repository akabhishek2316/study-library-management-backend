import Settings from '../models/Settings.js'
import { setOverrides, cfg } from './config.js'

export async function loadSettings() {
  const doc = await Settings.findOne().lean()

  setOverrides(doc || {})

  return cfg()
}

export async function saveSettings(patch) {
  const doc = await Settings.findOneAndUpdate(
    {},
    { $set: patch },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean()

  setOverrides(doc)

  return cfg()
}
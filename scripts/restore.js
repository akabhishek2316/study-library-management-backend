// Usage:
// npm run restore -- path/to/backup.json
// (Only works on an empty database)
//
// npm run restore -- path/to/backup.json --force
// (ERASES the current data first)

import 'dotenv/config'

import fs from 'fs'
import mongoose from 'mongoose'

import { COLLECTIONS } from '../utils/backup.js'

const [file, flag] = process.argv.slice(2)

if (!file) {
  console.log(
    'Usage: npm run restore -- backup.json [--force]'
  )

  process.exit(1)
}

const data = JSON.parse(
  fs.readFileSync(file, 'utf8')
)

if (data.app !== 'study-library') {
  console.log(
    'This does not look like a Study Library backup.'
  )

  process.exit(1)
}

await mongoose.connect(process.env.MONGO_URI)

const filled = []

for (const [name, Model] of Object.entries(COLLECTIONS)) {
  if ((await Model.estimatedDocumentCount()) > 0) {
    filled.push(name)
  }
}

if (filled.length && flag !== '--force') {
  console.log(
    `The database is not empty (${filled.join(', ')}). Use --force to erase it and restore from the file.`
  )

  process.exit(1)
}

for (const [name, Model] of Object.entries(COLLECTIONS)) {
  const docs = data.collections?.[name] || []

  if (flag === '--force') {
    await Model.deleteMany({})
  }

  if (docs.length) {
    await Model.insertMany(docs, {
      ordered: false
    })
  }

  console.log(`${name}: ${docs.length} restored`)
}

await mongoose.disconnect()

console.log('Done.')
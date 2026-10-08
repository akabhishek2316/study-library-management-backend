import 'dotenv/config'
import mongoose from 'mongoose'


const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI


if (!MONGO_URI) {
  console.error(
    '❌ MONGO_URI / MONGODB_URI is not configured.'
  )

  process.exit(1)
}


const normalizeHallType = (
  value
) => {
  const type =
    String(
      value || ''
    )
      .trim()
      .toLowerCase()


  if (
    type === 'ac' ||
    type === 'ac hall'
  ) {
    return 'AC'
  }


  if (
    type === 'non-ac' ||
    type === 'non ac' ||
    type === 'non-ac hall' ||
    type === 'non ac hall'
  ) {
    return 'Non-AC'
  }


  if (
    type === 'cabin' ||
    type === 'cabin hall'
  ) {
    return 'Cabin'
  }


  return null
}


const collectionExists =
  async (
    db,
    name
  ) => {
    const collections =
      await db
        .listCollections({
          name,
        })
        .toArray()


    return (
      collections.length >
      0
    )
  }


const migrate = async () => {
  console.log('')
  console.log(
    '========================================'
  )
  console.log(
    ' Study Library Database Migration'
  )
  console.log(
    ' Remove Section + Normalize Hall Types'
  )
  console.log(
    '========================================'
  )
  console.log('')


  await mongoose.connect(
    MONGO_URI
  )


  const db =
    mongoose.connection.db


  console.log(
    '✅ MongoDB connected'
  )


  /*
   * ---------------------------------------
   * 1. NORMALIZE HALL TYPES
   * ---------------------------------------
   */

  const halls =
    db.collection('halls')


  const hallDocs =
    await halls
      .find({})
      .toArray()


  let hallUpdated = 0
  let hallUnknown = 0


  for (
    const hall of hallDocs
  ) {
    const oldType =
      hall.type


    const newType =
      normalizeHallType(
        oldType
      )


    if (!newType) {
      console.warn(
        `⚠️ Unknown Hall type: "${oldType}" in Hall "${hall.name}"`
      )

      hallUnknown += 1

      continue
    }


    if (
      oldType !==
      newType
    ) {
      await halls.updateOne(
        {
          _id: hall._id,
        },
        {
          $set: {
            type: newType,
          },
        }
      )


      console.log(
        `✓ Hall "${hall.name}": ${oldType} → ${newType}`
      )


      hallUpdated += 1
    }
  }


  console.log('')
  console.log(
    `Hall types updated: ${hallUpdated}`
  )


  if (hallUnknown) {
    console.log(
      `Unknown Hall types: ${hallUnknown}`
    )
  }


  /*
   * ---------------------------------------
   * 2. CHECK SEATS
   * ---------------------------------------
   */

  const seats =
    db.collection('seats')


  const seatCount =
    await seats.countDocuments()


  console.log('')
  console.log(
    `Seats found: ${seatCount}`
  )


  /*
   * Check duplicate:
   * same hall + same number
   */

  const duplicateSeats =
    await seats
      .aggregate([
        {
          $group: {
            _id: {
              hall: '$hall',
              number: '$number',
            },

            count: {
              $sum: 1,
            },

            ids: {
              $push: '$_id',
            },
          },
        },

        {
          $match: {
            count: {
              $gt: 1,
            },
          },
        },
      ])
      .toArray()


  if (
    duplicateSeats.length
  ) {
    console.error('')
    console.error(
      '❌ Duplicate seats found.'
    )
    console.error(
      'Same Hall + same Seat Number cannot exist.'
    )
    console.error('')


    duplicateSeats.forEach(
      (item) => {
        console.error(
          `Hall: ${item._id.hall} | Number: ${item._id.number} | Count: ${item.count}`
        )

        console.error(
          `IDs: ${item.ids.join(', ')}`
        )
      }
    )


    console.error('')
    console.error(
      'Migration stopped before creating the unique index.'
    )


    await mongoose.disconnect()

    process.exit(1)
  }


  /*
   * ---------------------------------------
   * 3. REMOVE OLD SECTION FROM SEATS
   * ---------------------------------------
   */

  const seatSectionResult =
    await seats.updateMany(
      {
        section: {
          $exists: true,
        },
      },
      {
        $unset: {
          section: '',
        },
      }
    )


  console.log('')
  console.log(
    `✓ Removed section from ${seatSectionResult.modifiedCount} seat(s)`
  )


  /*
   * ---------------------------------------
   * 4. REMOVE OLD SECTION FROM MEMBERSHIPS
   * ---------------------------------------
   */

  const membershipsExists =
    await collectionExists(
      db,
      'memberships'
    )


  if (
    membershipsExists
  ) {
    const memberships =
      db.collection(
        'memberships'
      )


    const result =
      await memberships.updateMany(
        {
          section: {
            $exists: true,
          },
        },
        {
          $unset: {
            section: '',
          },
        }
      )


    console.log(
      `✓ Removed section from ${result.modifiedCount} membership(s)`
    )
  } else {
    console.log(
      'ℹ memberships collection not found'
    )
  }


  /*
   * ---------------------------------------
   * 5. REMOVE OLD SECTION FROM
   *    ADMISSION REQUESTS
   * ---------------------------------------
   */

  const admissionExists =
    await collectionExists(
      db,
      'admissionrequests'
    )


  if (
    admissionExists
  ) {
    const admissions =
      db.collection(
        'admissionrequests'
      )


    const result =
      await admissions.updateMany(
        {
          section: {
            $exists: true,
          },
        },
        {
          $unset: {
            section: '',
          },
        }
      )


    console.log(
      `✓ Removed section from ${result.modifiedCount} admission request(s)`
    )
  } else {
    console.log(
      'ℹ admissionrequests collection not found'
    )
  }


  /*
   * ---------------------------------------
   * 6. REMOVE OLD SEAT INDEXES
   * ---------------------------------------
   */

  const existingIndexes =
    await seats.indexes()


  console.log('')
  console.log(
    'Existing Seat indexes:'
  )


  existingIndexes.forEach(
    (index) => {
      console.log(
        `  - ${index.name}`
      )
    }
  )


  for (
    const index of existingIndexes
  ) {
    if (
      index.name ===
      '_id_'
    ) {
      continue
    }


    try {
      await seats.dropIndex(
        index.name
      )


      console.log(
        `✓ Dropped old Seat index: ${index.name}`
      )
    } catch (error) {
      console.warn(
        `⚠️ Could not drop index ${index.name}: ${error.message}`
      )
    }
  }


  /*
   * ---------------------------------------
   * 7. CREATE CORRECT SEAT INDEX
   * ---------------------------------------
   */

  await seats.createIndex(
    {
      hall: 1,
      number: 1,
    },
    {
      unique: true,
      name:
        'hall_1_number_1',
    }
  )


  console.log(
    '✓ Created unique index: hall_1_number_1'
  )


  /*
   * ---------------------------------------
   * 8. REMOVE SECTION COLLECTION
   * ---------------------------------------
   */

  const sectionExists =
    await collectionExists(
      db,
      'sections'
    )


  if (
    sectionExists
  ) {
    await db.dropCollection(
      'sections'
    )


    console.log(
      '✓ Removed sections collection'
    )
  } else {
    console.log(
      'ℹ sections collection does not exist'
    )
  }


  /*
   * ---------------------------------------
   * 9. FINAL VERIFICATION
   * ---------------------------------------
   */

  console.log('')
  console.log(
    '========== Verification =========='
  )


  const invalidHallTypes =
    await halls
      .find({
        type: {
          $nin: [
            'AC',
            'Non-AC',
            'Cabin',
          ],
        },
      })
      .toArray()


  if (
    invalidHallTypes.length
  ) {
    console.warn(
      `⚠️ Invalid Hall types remaining: ${invalidHallTypes.length}`
    )

    invalidHallTypes.forEach(
      (hall) => {
        console.warn(
          `   ${hall.name} → ${hall.type}`
        )
      }
    )
  } else {
    console.log(
      '✓ All Hall types are valid'
    )
  }


  const seatsWithSection =
    await seats.countDocuments({
      section: {
        $exists: true,
      },
    })


  console.log(
    `✓ Seats still containing section: ${seatsWithSection}`
  )


  const finalIndexes =
    await seats.indexes()


  console.log('')
  console.log(
    'Final Seat indexes:'
  )


  finalIndexes.forEach(
    (index) => {
      console.log(
        `  - ${index.name}`
      )
    }
  )


  console.log('')
  console.log(
    '========================================'
  )
  console.log(
    '✅ Migration completed successfully'
  )
  console.log(
    '========================================'
  )
  console.log('')


  await mongoose.disconnect()
}


migrate()
  .catch(
    async (error) => {
      console.error('')
      console.error(
        '❌ Migration failed:'
      )
      console.error(
        error
      )


      try {
        await mongoose.disconnect()
      } catch {}


      process.exit(1)
    }
  )
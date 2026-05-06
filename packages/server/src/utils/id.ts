import { randomInt, randomUUID } from 'node:crypto'

const ID_SPACE = 0x1000000

export const generateUserId = () => randomUUID()

export const generateObjectId = (usedIds: Set<string>) => {
  if (usedIds.size >= ID_SPACE) {
    throw new Error('No available 6-digit hex ids')
  }

  let id = ''

  do {
    id = randomInt(ID_SPACE).toString(16).padStart(6, '0')
  } while (usedIds.has(id))

  return id
}

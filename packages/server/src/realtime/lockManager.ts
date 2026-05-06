import type { ObjectLock } from '@board-forge/shared'

type LockRecord = {
  userId: string
  expiresAt: number
}

type LockRequestResult =
  | {
      granted: true
    }
  | {
      granted: false
      ownerUserId: string
    }

export const createLockManager = (ttlMs: number) => {
  const locks = new Map<string, LockRecord>()

  const expiresAt = () => Date.now() + ttlMs

  const snapshot = (): ObjectLock[] => {
    return Array.from(locks, ([objectId, lock]) => ({
      objectId,
      userId: lock.userId,
      expiresAt: lock.expiresAt,
    }))
  }

  const getOwner = (objectId: string) => {
    return locks.get(objectId)?.userId
  }

  const refresh = (objectId: string, userId: string) => {
    locks.set(objectId, {
      userId,
      expiresAt: expiresAt(),
    })
  }

  const request = (objectId: string, userId: string): LockRequestResult => {
    const ownerUserId = getOwner(objectId)

    if (ownerUserId && ownerUserId !== userId) {
      return { granted: false, ownerUserId }
    }

    refresh(objectId, userId)
    return { granted: true }
  }

  const release = (objectId: string, userId: string) => {
    if (getOwner(objectId) !== userId) return false

    locks.delete(objectId)
    return true
  }

  const releaseByUser = (userId: string) => {
    let changed = false

    for (const [objectId, lock] of locks) {
      if (lock.userId === userId) {
        locks.delete(objectId)
        changed = true
      }
    }

    return changed
  }

  const cleanupExpired = () => {
    const now = Date.now()
    let changed = false

    for (const [objectId, lock] of locks) {
      if (lock.expiresAt <= now) {
        locks.delete(objectId)
        changed = true
      }
    }

    return changed
  }

  return {
    cleanupExpired,
    getOwner,
    refresh,
    release,
    releaseByUser,
    request,
    snapshot,
  }
}

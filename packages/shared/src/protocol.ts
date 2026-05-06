import { z } from 'zod'
import { GameStateSchema } from './game.js'

export const ClientMoveMessageSchema = z.object({
  type: z.literal('move'),
  userId: z.string().min(1),
  objectId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  clientTime: z.number(),
})

export const ClientHelloMessageSchema = z.object({
  type: z.literal('hello'),
  userId: z.string().min(1).optional(),
})

export const ClientDragStartMessageSchema = z.object({
  type: z.literal('drag-start'),
  userId: z.string().min(1),
  objectId: z.string().min(1),
})

export const ClientDragEndMessageSchema = z.object({
  type: z.literal('drag-end'),
  userId: z.string().min(1),
  objectId: z.string().min(1),
})

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientMoveMessageSchema,
  ClientHelloMessageSchema,
  ClientDragStartMessageSchema,
  ClientDragEndMessageSchema,
])

export const ServerStateMessageSchema = z.object({
  type: z.literal('state'),
  tick: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  serverTime: z.number(),
  state: GameStateSchema,
})

export const ServerUserMessageSchema = z.object({
  type: z.literal('user'),
  userId: z.string().min(1),
})

export const ServerLockGrantedMessageSchema = z.object({
  type: z.literal('lock-granted'),
  objectId: z.string().min(1),
  userId: z.string().min(1),
})

export const ServerLockDeniedMessageSchema = z.object({
  type: z.literal('lock-denied'),
  objectId: z.string().min(1),
  userId: z.string().min(1),
})

export const ObjectLockSchema = z.object({
  objectId: z.string().min(1),
  userId: z.string().min(1),
  expiresAt: z.number(),
})

export const ServerLocksMessageSchema = z.object({
  type: z.literal('locks'),
  locks: z.array(ObjectLockSchema),
})

export const ServerMessageSchema = z.discriminatedUnion('type', [
  ServerStateMessageSchema,
  ServerUserMessageSchema,
  ServerLockGrantedMessageSchema,
  ServerLockDeniedMessageSchema,
  ServerLocksMessageSchema,
])

export type ClientMoveMessage = z.infer<typeof ClientMoveMessageSchema>
export type ClientHelloMessage = z.infer<typeof ClientHelloMessageSchema>
export type ClientDragStartMessage = z.infer<typeof ClientDragStartMessageSchema>
export type ClientDragEndMessage = z.infer<typeof ClientDragEndMessageSchema>
export type ClientMessage = z.infer<typeof ClientMessageSchema>

export type ServerStateMessage = z.infer<typeof ServerStateMessageSchema>
export type ServerUserMessage = z.infer<typeof ServerUserMessageSchema>
export type ServerLockGrantedMessage = z.infer<typeof ServerLockGrantedMessageSchema>
export type ServerLockDeniedMessage = z.infer<typeof ServerLockDeniedMessageSchema>
export type ObjectLock = z.infer<typeof ObjectLockSchema>
export type ServerLocksMessage = z.infer<typeof ServerLocksMessageSchema>
export type ServerMessage = z.infer<typeof ServerMessageSchema>

export type PendingMove = ClientMoveMessage & {
  receivedAt: number
}

export const isMoveMessage = (message: unknown): message is ClientMoveMessage => {
  return ClientMoveMessageSchema.safeParse(message).success
}

export const isHelloMessage = (message: unknown): message is ClientHelloMessage => {
  return ClientHelloMessageSchema.safeParse(message).success
}

export const isDragStartMessage = (message: unknown): message is ClientDragStartMessage => {
  return ClientDragStartMessageSchema.safeParse(message).success
}

export const isDragEndMessage = (message: unknown): message is ClientDragEndMessage => {
  return ClientDragEndMessageSchema.safeParse(message).success
}

import { z } from 'zod'

const BaseObjectSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  opacity: z.number().optional(),
  rotation: z.number().optional(),
  zIndex: z.number().optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
})

export const SquareObjectSchema = BaseObjectSchema.extend({
  kind: z.literal('square'),
  size: z.number().positive(),
  borderRadius: z.number().nonnegative().optional(),
})

export const RectangleObjectSchema = BaseObjectSchema.extend({
  kind: z.literal('rectangle'),
  width: z.number().positive(),
  height: z.number().positive(),
  borderRadius: z.number().nonnegative().optional(),
})

export const CircleObjectSchema = BaseObjectSchema.extend({
  kind: z.literal('circle'),
  radius: z.number().positive(),
})

export const BoardObjectSchema = z.discriminatedUnion('kind', [
  SquareObjectSchema,
  RectangleObjectSchema,
  CircleObjectSchema,
])

export const GameBoardSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
})

export const GameStateSchema = z.object({
  board: GameBoardSchema,
  objects: z.array(BoardObjectSchema),
})

export type GameObjectKind = z.infer<typeof BoardObjectSchema>['kind']
export type GameObject = z.infer<typeof BaseObjectSchema> & {
  kind: GameObjectKind
}
export type SquareObject = z.infer<typeof SquareObjectSchema>
export type RectangleObject = z.infer<typeof RectangleObjectSchema>
export type CircleObject = z.infer<typeof CircleObjectSchema>
export type BoardObject = z.infer<typeof BoardObjectSchema>
export type GameBoard = z.infer<typeof GameBoardSchema>
export type GameState = z.infer<typeof GameStateSchema>

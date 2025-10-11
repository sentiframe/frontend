import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Emotion data types
export const EmotionData = z.object({
  time: z.number(),
  Happy: z.number(),
  Sad: z.number(),
  Angry: z.number(),
  Fear: z.number(),
  Surprise: z.number(),
  Disgust: z.number(),
  Neutral: z.number(),
  dominant: z.string().optional(),
  dominantValue: z.number().optional(),
});

export type EmotionDataPoint = z.infer<typeof EmotionData>;

// Critical moment type
export const CriticalMoment = z.object({
  time: z.number(),
  emotion: z.string(),
  intensity: z.number(),
  description: z.string(),
});

export type CriticalMomentType = z.infer<typeof CriticalMoment>;

// Session schema
export const SessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  time: z.string(),
  duration: z.number(),
  isFavorite: z.boolean(),
  videoId: z.string().optional(),
  emotionData: z.array(EmotionData),
  criticalMoments: z.array(CriticalMoment).optional(),
  aiReport: z.object({
    summary: z.string(),
    suggestions: z.array(z.string()),
  }).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

export const InsertSessionSchema = SessionSchema.omit({ id: true });
export type InsertSession = z.infer<typeof InsertSessionSchema>;

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getFrame, getAllFrames, type EmotionScores } from "./firebase";
import { generateEmotionReport, type EmotionFrameData } from "./gemini";
import { InsertSessionSchema, type EmotionDataPoint, type CriticalMomentType } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get a specific frame from Firebase
  app.get("/api/frames/:videoId/:frameNumber", async (req, res) => {
    try {
      const { videoId, frameNumber } = req.params;
      const frame = await getFrame(videoId, parseInt(frameNumber));
      
      if (!frame) {
        return res.status(404).json({ error: "Frame not found" });
      }

      res.json(frame);
    } catch (error) {
      console.error("Error fetching frame:", error);
      res.status(500).json({ error: "Failed to fetch frame" });
    }
  });

  // Get all frames for a video
  app.get("/api/frames/:videoId/all", async (req, res) => {
    try {
      const { videoId } = req.params;
      const frames = await getAllFrames(videoId);
      res.json(frames);
    } catch (error) {
      console.error("Error fetching all frames:", error);
      res.status(500).json({ error: "Failed to fetch frames" });
    }
  });

  // Generate AI report from emotion data
  app.post("/api/report/generate", async (req, res) => {
    try {
      const { frames } = req.body as { frames: EmotionFrameData[] };
      
      if (!frames || !Array.isArray(frames) || frames.length === 0) {
        return res.status(400).json({ error: "Invalid or empty frames data" });
      }

      const report = await generateEmotionReport(frames);
      res.json(report);
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // Session endpoints
  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const validated = InsertSessionSchema.parse(req.body);
      const session = await storage.createSession(validated);
      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(400).json({ error: "Invalid session data" });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Critical moments detection endpoint (stub for now)
  app.post("/api/critical-moments", async (req, res) => {
    try {
      const { emotionData } = req.body as { emotionData: EmotionDataPoint[] };
      
      if (!emotionData || !Array.isArray(emotionData) || emotionData.length === 0) {
        return res.status(400).json({ error: "Invalid emotion data" });
      }

      // Stub: Detect critical moments based on emotion spikes
      const criticalMoments: CriticalMomentType[] = [];
      
      for (let i = 1; i < emotionData.length - 1; i++) {
        const curr = emotionData[i];
        const prev = emotionData[i - 1];
        const next = emotionData[i + 1];
        
        // Find local maxima for each emotion
        Object.keys(curr).forEach((emotion) => {
          if (emotion === 'time' || emotion === 'dominant' || emotion === 'dominantValue') return;
          
          const currVal = curr[emotion as keyof EmotionDataPoint] as number;
          const prevVal = prev[emotion as keyof EmotionDataPoint] as number || 0;
          const nextVal = next[emotion as keyof EmotionDataPoint] as number || 0;
          
          // Detect peaks (value higher than neighbors and above threshold)
          if (currVal > prevVal && currVal > nextVal && currVal > 0.6) {
            criticalMoments.push({
              time: curr.time,
              emotion,
              intensity: currVal,
              description: `${emotion} spike detected`
            });
          }
        });
      }

      res.json(criticalMoments);
    } catch (error) {
      console.error("Error detecting critical moments:", error);
      res.status(500).json({ error: "Failed to detect critical moments" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

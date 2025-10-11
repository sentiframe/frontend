import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getFrame, getAllFrames, type EmotionScores } from "./firebase";
import { generateEmotionReport, type EmotionFrameData } from "./gemini";

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

  const httpServer = createServer(app);

  return httpServer;
}

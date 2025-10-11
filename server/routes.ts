import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getFrame, getAllFrames, type EmotionScores } from "./firebase";

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

  const httpServer = createServer(app);

  return httpServer;
}

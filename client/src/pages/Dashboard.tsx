import { useState, useEffect } from "react";
import EmotionChart from "@/components/EmotionChart";
import EmotionLegend from "@/components/EmotionLegend";
import CriticalMoments from "@/components/CriticalMoments";
import TimelineScrubber from "@/components/TimelineScrubber";
import TranscriptPanel from "@/components/TranscriptPanel";
import ControlPanel from "@/components/ControlPanel";
import SessionReport from "@/components/SessionReport";
import UserSelector from "@/components/UserSelector";
import EmotionEvaluationBar from "@/components/EmotionEvaluationBar";

//todo: remove mock functionality
const generateMockData = (seconds: number) => {
  const data = [];
  for (let t = 0; t < seconds; t++) {
    const phase = t < seconds / 4 ? "opening" : t < seconds / 2 ? "build" : t < (3 * seconds) / 4 ? "peak" : "resolve";
    const base = {
      Angry: phase === "opening" ? 0.05 : phase === "build" ? 0.08 : phase === "peak" ? 0.18 : 0.06,
      Disgust: phase === "opening" ? 0.02 : phase === "build" ? 0.03 : phase === "peak" ? 0.06 : 0.03,
      Fear: phase === "opening" ? 0.04 : phase === "build" ? 0.10 : phase === "peak" ? 0.22 : 0.07,
      Happy: phase === "opening" ? 0.45 : phase === "build" ? 0.28 : phase === "peak" ? 0.12 : 0.42,
      Sad: phase === "opening" ? 0.06 : phase === "build" ? 0.12 : phase === "peak" ? 0.20 : 0.08,
      Surprise: phase === "opening" ? 0.08 : phase === "build" ? 0.16 : phase === "peak" ? 0.10 : 0.10,
      Neutral: phase === "opening" ? 0.30 : phase === "build" ? 0.23 : phase === "peak" ? 0.12 : 0.24,
    };
    
    const jittered = Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, Math.max(0, v + (Math.random() - 0.5) * 0.02)])
    );
    
    const total = Object.values(jittered).reduce((a: number, b) => a + (b as number), 0);
    const normalized = Object.fromEntries(
      Object.entries(jittered).map(([k, v]) => [k, (v as number) / total])
    );
    
    const dominant = Object.entries(normalized).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0];
    
    data.push({ 
      time: t + 1, 
      ...normalized, 
      dominant, 
      dominantValue: normalized[dominant]
    });
  }
  return data;
};

//todo: remove mock functionality
const mockTranscript = [
  { time: 1, words: "Good morning everyone, thank you for joining today's presentation." },
  { time: 5, words: "I'm excited to share our latest findings with all of you." },
  { time: 10, words: "Let's start with an overview of our research methodology." },
  { time: 15, words: "The data reveals some concerning trends that we must address." },
  { time: 20, words: "However, there are also positive developments worth celebrating." },
  { time: 25, words: "Our team has made remarkable progress in the past quarter." },
  { time: 30, words: "This brings me to my next point about our future strategies." },
  { time: 35, words: "We're facing significant challenges in the current market." },
  { time: 40, words: "But I'm confident we have the right approach to overcome them." },
];

//todo: remove mock functionality
const mockUsers = [
  { id: 'user1', name: 'Primary Speaker' },
  { id: 'user2', name: 'Secondary Speaker' },
];

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionData, setSessionData] = useState<any[]>([]);
  const [selectedEmotions, setSelectedEmotions] = useState(new Set(["Happy", "Sad", "Angry", "Fear"]));
  const [currentTime, setCurrentTime] = useState(1);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [criticalMoments, setCriticalMoments] = useState<any[]>([]);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [selectedUser, setSelectedUser] = useState('user1');
  const [videoId, setVideoId] = useState("wagwan");
  const [currentFrame, setCurrentFrame] = useState(0);
  const [aiReport, setAiReport] = useState<{ summary: string; suggestions: string[] } | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Poll Firebase every second for new frame data
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(async () => {
        setCurrentFrame(prevFrame => {
          const nextFrame = prevFrame + 1;
          
          // Fetch frame data from Firebase via backend API
          fetch(`/api/frames/${videoId}/${nextFrame}`)
            .then(res => res.json())
            .then(frameData => {
              if (frameData && !frameData.error && frameData.detections && frameData.detections.length > 0) {
                const detection = frameData.detections[0];
                const emotions = detection.emotion_scores;
                
                // Map Firebase format to chart format
                const chartData = {
                  time: nextFrame,
                  Angry: emotions.anger || 0,
                  Disgust: emotions.disgust || 0,
                  Fear: emotions.fear || 0,
                  Happy: emotions.happiness || 0,
                  Sad: emotions.sadness || 0,
                  Surprise: emotions.surprise || 0,
                  Neutral: emotions.neutral || 0,
                };
                
                // Calculate dominant emotion
                const emotionValues = [
                  { name: 'Angry', value: chartData.Angry },
                  { name: 'Disgust', value: chartData.Disgust },
                  { name: 'Fear', value: chartData.Fear },
                  { name: 'Happy', value: chartData.Happy },
                  { name: 'Sad', value: chartData.Sad },
                  { name: 'Surprise', value: chartData.Surprise },
                  { name: 'Neutral', value: chartData.Neutral },
                ];
                const dominant = emotionValues.reduce((max, curr) => curr.value > max.value ? curr : max);
                
                const dataPoint = {
                  ...chartData,
                  dominant: dominant.name,
                  dominantValue: dominant.value
                };
                
                setSessionData(prev => [...prev, dataPoint]);
                setCurrentTime(nextFrame);
                setSessionDuration(nextFrame);
              }
            })
            .catch(err => console.error('Error fetching frame:', err));
          
          return nextFrame;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, videoId]);

  useEffect(() => {
    if (sessionData.length > 1) {
      const newMoments: any[] = [];
      for (let i = 1; i < sessionData.length; i++) {
        if (sessionData[i].dominant !== sessionData[i - 1].dominant) {
          const severity = Math.abs(sessionData[i].dominantValue - sessionData[i - 1].dominantValue);
          newMoments.push({
            time: sessionData[i].time,
            from: sessionData[i - 1].dominant,
            to: sessionData[i].dominant,
            severity
          });
        }
      }
      setCriticalMoments(newMoments);
    }
  }, [sessionData]);

  const handleStartSession = () => {
    setIsRecording(true);
    setSessionData([]);
    setSessionDuration(0);
    setCriticalMoments([]);
    setTranscript([]);
    setShowReport(false);
    setCurrentFrame(0);
    console.log('Starting session - will poll backend every second');
  };

  const handleEndSession = async () => {
    setIsRecording(false);
    setIsGeneratingReport(true);
    console.log('Session ended - generating AI report with', sessionData.length, 'frames');
    
    try {
      const response = await fetch('/api/report/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ frames: sessionData }),
      });
      
      if (response.ok) {
        const report = await response.json();
        setAiReport(report);
        console.log('AI report generated successfully');
      } else {
        console.error('Failed to generate report');
        setAiReport({
          summary: "Unable to generate AI analysis at this time.",
          suggestions: ["Please try again later."]
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      setAiReport({
        summary: "Unable to generate AI analysis at this time.",
        suggestions: ["Please try again later."]
      });
    } finally {
      setIsGeneratingReport(false);
      setShowReport(true);
    }
  };

  const handleToggleEmotion = (emotion: string) => {
    const newSelected = new Set(selectedEmotions);
    if (newSelected.has(emotion)) {
      newSelected.delete(emotion);
    } else {
      newSelected.add(emotion);
    }
    setSelectedEmotions(newSelected);
  };

  const currentData = sessionData[currentTime - 1] || { dominant: "Neutral", dominantValue: 0 };

  const reportStats = {
    totalDuration: sessionDuration,
    emotionSwitches: criticalMoments.length,
    dominantEmotion: sessionData.length > 0 ? 
      Object.entries(
        sessionData.reduce((acc: any, d: any) => {
          acc[d.dominant] = (acc[d.dominant] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || "Neutral"
      : "Neutral",
    dominantPercentage: sessionData.length > 0 ?
      Math.round((Object.entries(
        sessionData.reduce((acc: any, d: any) => {
          acc[d.dominant] = (acc[d.dominant] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[1] as number || 0) / sessionData.length * 100)
      : 0,
  };

  const fullReport = {
    summary: aiReport?.summary || "Generating analysis...",
    suggestions: aiReport?.suggestions || [],
    stats: reportStats,
  };

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <div className="border-b border-gray-200 dark:border-border bg-white dark:bg-background">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-foreground">Emotion Analysis Dashboard</h1>
              <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">Real-time speech emotion tracking and analysis</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-12 space-y-8">
        <ControlPanel 
          isRecording={isRecording}
          onStartSession={handleStartSession}
          onEndSession={handleEndSession}
          sessionDuration={sessionDuration}
          onExport={() => console.log('Export clicked')}
          videoId={videoId}
          onVideoIdChange={setVideoId}
        />

        {sessionData.length > 0 && !showReport && (
          <>
            <UserSelector 
              users={mockUsers}
              selectedUser={selectedUser}
              onSelectUser={setSelectedUser}
            />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <EmotionEvaluationBar 
                  dominantEmotion={currentData.dominant}
                  dominantValue={currentData.dominantValue}
                  time={currentTime}
                />
              </div>

              <div className="lg:col-span-3">
                <EmotionChart 
                  data={sessionData}
                  selectedEmotions={selectedEmotions}
                  criticalMoments={criticalMoments}
                  currentTime={currentTime}
                />
              </div>
            </div>

            <TimelineScrubber 
              currentTime={currentTime}
              maxTime={sessionData.length}
              onSeek={setCurrentTime}
              dominantEmotion={currentData.dominant}
            />

            <EmotionLegend 
              selectedEmotions={selectedEmotions}
              onToggle={handleToggleEmotion}
            />

            <CriticalMoments 
              moments={criticalMoments}
              onSeek={setCurrentTime}
              currentTime={currentTime}
            />

            <TranscriptPanel 
              segments={transcript}
              currentTime={currentTime}
              onSeek={setCurrentTime}
            />
          </>
        )}

        {showReport && sessionData.length > 0 && (
          <>
            {isGeneratingReport && (
              <div className="text-center py-8" data-testid="generating-report">
                <p className="text-muted-foreground">Generating AI-powered analysis...</p>
              </div>
            )}
            {!isGeneratingReport && aiReport && (
              <SessionReport {...fullReport} />
            )}
          </>
        )}

        {!isRecording && sessionData.length === 0 && (
          <div className="text-center py-20" data-testid="empty-state">
            <p className="text-muted-foreground">Click "Start Session" to begin emotion analysis</p>
          </div>
        )}
      </div>
    </div>
  );
}

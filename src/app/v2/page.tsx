"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

type Step = "situation" | "prompt" | "video" | "character" | "next";

interface TaskStatus {
  taskId: string;
  state: "waiting" | "queuing" | "generating" | "success" | "fail";
  progress: number;
  resultUrl: string | null;
}

interface V2Session {
  id: string;
  situation: string;
  prompt: string | null;
  videoTaskId: string | null;
  videoUrl: string | null;
  videoLocalPath: string | null;
  characterUsername: string | null;
  characterTaskId: string | null;
  characterTimestamps: string | null;
  nextPrompt: string | null;
  nextVideoTaskId: string | null;
  nextVideoUrl: string | null;
  nextVideoLocalPath: string | null;
  step: string;
  createdAt: string;
  updatedAt: string;
}

export default function V2StudioPage() {
  // Session management
  const [sessions, setSessions] = useState<V2Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>("situation");

  // Step 1: Situation
  const [situation, setSituation] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Step 2: Prompt
  const [prompt, setPrompt] = useState("");

  // Step 3: Video
  const [videoTaskId, setVideoTaskId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLocalPath, setVideoLocalPath] = useState("");
  const [videoStatus, setVideoStatus] = useState<TaskStatus | null>(null);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 4: Character
  const [characterUsername, setCharacterUsername] = useState("");
  const [characterTimestamps, setCharacterTimestamps] = useState("1,4");
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [characterTaskId, setCharacterTaskId] = useState("");
  const [characterStatus, setCharacterStatus] = useState<TaskStatus | null>(null);
  const characterPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 5: Next 15s
  const [nextPrompt, setNextPrompt] = useState("");
  const [generatingNextPrompt, setGeneratingNextPrompt] = useState(false);
  const [nextVideoTaskId, setNextVideoTaskId] = useState("");
  const [nextVideoUrl, setNextVideoUrl] = useState("");
  const [nextVideoLocalPath, setNextVideoLocalPath] = useState("");
  const [nextVideoStatus, setNextVideoStatus] = useState<TaskStatus | null>(null);
  const [generatingNextVideo, setGeneratingNextVideo] = useState(false);
  const nextPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (characterPollingRef.current) clearTimeout(characterPollingRef.current);
      if (nextPollingRef.current) clearTimeout(nextPollingRef.current);
    };
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/v2/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoadingSessions(false);
    }
  }

  // Save session to DB
  const saveSession = useCallback(async (updates: Record<string, unknown>) => {
    if (!sessionId) return;
    try {
      await fetch(`/api/v2/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  }, [sessionId]);

  // Download video to local storage
  async function downloadVideo(url: string, taskId: string): Promise<string | null> {
    try {
      const res = await fetch("/api/v2/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.localPath;
      }
    } catch (error) {
      console.error("Failed to download video:", error);
    }
    return null;
  }

  // Resume a session
  function resumeSession(session: V2Session) {
    setSessionId(session.id);
    setSituation(session.situation);
    setPrompt(session.prompt || "");
    setVideoTaskId(session.videoTaskId || "");
    setVideoUrl(session.videoUrl || "");
    setVideoLocalPath(session.videoLocalPath || "");
    setCharacterUsername(session.characterUsername || "");
    setCharacterTimestamps(session.characterTimestamps || "1,4");
    setCharacterTaskId(session.characterTaskId || "");
    setNextPrompt(session.nextPrompt || "");
    setNextVideoTaskId(session.nextVideoTaskId || "");
    setNextVideoUrl(session.nextVideoUrl || "");
    setNextVideoLocalPath(session.nextVideoLocalPath || "");
    setCurrentStep(session.step as Step);

    // If video is complete, set status so the UI shows it
    if (session.videoUrl || session.videoLocalPath) {
      setVideoStatus({
        taskId: session.videoTaskId || "",
        state: "success",
        progress: 100,
        resultUrl: session.videoLocalPath || session.videoUrl,
      });
    }
    if (session.nextVideoUrl || session.nextVideoLocalPath) {
      setNextVideoStatus({
        taskId: session.nextVideoTaskId || "",
        state: "success",
        progress: 100,
        resultUrl: session.nextVideoLocalPath || session.nextVideoUrl,
      });
    }

    // Resume polling if tasks are in progress
    if (session.videoTaskId && !session.videoUrl) {
      pollTaskStatus(session.videoTaskId, setVideoStatus, pollingRef, "video");
    }
    if (session.characterTaskId && session.step === "character" && !session.nextPrompt) {
      pollTaskStatus(session.characterTaskId, setCharacterStatus, characterPollingRef, "character");
    }
    if (session.nextVideoTaskId && !session.nextVideoUrl) {
      pollTaskStatus(session.nextVideoTaskId, setNextVideoStatus, nextPollingRef, "nextVideo");
    }
  }

  // Start new session
  function startNewSession() {
    setSessionId(null);
    setSituation("");
    setPrompt("");
    setVideoTaskId("");
    setVideoUrl("");
    setVideoLocalPath("");
    setVideoStatus(null);
    setCharacterUsername("");
    setCharacterTimestamps("1,4");
    setCharacterTaskId("");
    setCharacterStatus(null);
    setNextPrompt("");
    setNextVideoTaskId("");
    setNextVideoUrl("");
    setNextVideoLocalPath("");
    setNextVideoStatus(null);
    setCurrentStep("situation");
  }

  // Step 1: Generate prompt from situation
  async function handleGeneratePrompt() {
    if (!situation.trim() || generatingPrompt) return;
    setGeneratingPrompt(true);
    try {
      // Create session if new
      let sid = sessionId;
      if (!sid) {
        const createRes = await fetch("/api/v2/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ situation: situation.trim() }),
        });
        if (!createRes.ok) throw new Error("Failed to create session");
        const session = await createRes.json();
        sid = session.id;
        setSessionId(sid);
      }

      const res = await fetch("/api/v2/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: situation.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      const data = await res.json();
      setPrompt(data.prompt);
      setCurrentStep("prompt");

      // Save to DB
      await fetch(`/api/v2/sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: data.prompt, step: "prompt" }),
      });
    } catch (error) {
      alert(`Failed to generate prompt: ${error}`);
    } finally {
      setGeneratingPrompt(false);
    }
  }

  // Step 2: Generate video from prompt
  async function handleGenerateVideo() {
    if (!prompt.trim() || generatingVideo) return;
    setGeneratingVideo(true);
    setVideoStatus(null);
    try {
      const res = await fetch("/api/v2/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      const data = await res.json();
      setVideoTaskId(data.taskId);
      setCurrentStep("video");
      pollTaskStatus(data.taskId, setVideoStatus, pollingRef, "video");

      await saveSession({ videoTaskId: data.taskId, step: "video", prompt: prompt.trim() });
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingVideo(false);
    }
  }

  // Generic task polling with auto-download on success
  function pollTaskStatus(
    taskId: string,
    setStatus: (s: TaskStatus) => void,
    ref: React.RefObject<ReturnType<typeof setTimeout> | null>,
    type: "video" | "character" | "nextVideo"
  ) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const status: TaskStatus = await res.json();
        setStatus(status);

        if (status.state === "waiting" || status.state === "queuing" || status.state === "generating") {
          ref.current = setTimeout(poll, 5000);
        } else if (status.state === "success" && status.resultUrl) {
          // Auto-download video on success
          if (type === "video") {
            const localPath = await downloadVideo(status.resultUrl, taskId);
            setVideoUrl(status.resultUrl);
            if (localPath) setVideoLocalPath(localPath);
            await saveSession({
              videoUrl: status.resultUrl,
              videoLocalPath: localPath,
            });
          } else if (type === "nextVideo") {
            const localPath = await downloadVideo(status.resultUrl, taskId);
            setNextVideoUrl(status.resultUrl);
            if (localPath) setNextVideoLocalPath(localPath);
            await saveSession({
              nextVideoUrl: status.resultUrl,
              nextVideoLocalPath: localPath,
              step: "next",
            });
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    ref.current = setTimeout(poll, 3000);
  }

  // Step 4: Create character
  async function handleCreateCharacter() {
    if (!characterUsername.trim() || creatingCharacter) return;
    setCreatingCharacter(true);
    setCharacterStatus(null);
    try {
      const res = await fetch("/api/v2/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: videoTaskId,
          username: characterUsername.trim(),
          characterPrompt: situation.trim(),
          timestamps: characterTimestamps.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      const data = await res.json();
      setCharacterTaskId(data.taskId);
      pollTaskStatus(data.taskId, setCharacterStatus, characterPollingRef, "character");

      await saveSession({
        characterUsername: characterUsername.trim(),
        characterTaskId: data.taskId,
        characterTimestamps: characterTimestamps.trim(),
        step: "character",
      });
    } catch (error) {
      alert(`Failed to create character: ${error}`);
    } finally {
      setCreatingCharacter(false);
    }
  }

  // Step 5: Generate next prompt with character
  async function handleGenerateNextPrompt() {
    if (generatingNextPrompt) return;
    setGeneratingNextPrompt(true);
    try {
      const res = await fetch("/api/v2/continue-with-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basePrompt: prompt,
          characterUsername: characterUsername.trim(),
          situation: situation.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      const data = await res.json();
      setNextPrompt(data.prompt);
      setCurrentStep("next");

      await saveSession({ nextPrompt: data.prompt, step: "next" });
    } catch (error) {
      alert(`Failed to generate next prompt: ${error}`);
    } finally {
      setGeneratingNextPrompt(false);
    }
  }

  // Step 5: Generate next video
  async function handleGenerateNextVideo() {
    if (!nextPrompt.trim() || generatingNextVideo) return;
    setGeneratingNextVideo(true);
    setNextVideoStatus(null);
    try {
      const res = await fetch("/api/v2/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        return;
      }
      const data = await res.json();
      setNextVideoTaskId(data.taskId);
      pollTaskStatus(data.taskId, setNextVideoStatus, nextPollingRef, "nextVideo");

      await saveSession({ nextVideoTaskId: data.taskId, nextPrompt: nextPrompt.trim() });
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingNextVideo(false);
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/v2/sessions/${id}`, { method: "DELETE" });
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: "situation", label: "Situation" },
    { key: "prompt", label: "Prompt" },
    { key: "video", label: "Video" },
    { key: "character", label: "Character" },
    { key: "next", label: "Next 15s" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === currentStep);

  // Show session list if no active session and on situation step with no input
  const showSessionList = !sessionId && currentStep === "situation" && !situation;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white">V2 Studio</h1>
          </div>
          {sessionId && (
            <button
              onClick={() => { startNewSession(); fetchSessions(); }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              New Session
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Session List */}
        {showSessionList && (
          <div className="space-y-6 mb-8">
            {loadingSessions ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : sessions.length > 0 ? (
              <>
                <h2 className="text-lg font-semibold text-white">Previous Sessions</h2>
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => resumeSession(session)}>
                        <p className="text-white text-sm font-medium truncate">{session.situation}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            session.step === "next" ? "bg-emerald-600/20 text-emerald-400" :
                            session.step === "video" ? "bg-blue-600/20 text-blue-400" :
                            "bg-zinc-700 text-zinc-400"
                          }`}>
                            {session.step}
                          </span>
                          {(session.videoLocalPath || session.videoUrl) && (
                            <span className="text-xs text-zinc-500">has video</span>
                          )}
                          {session.characterUsername && (
                            <span className="text-xs text-zinc-500">char: {session.characterUsername}</span>
                          )}
                          <span className="text-xs text-zinc-600">
                            {new Date(session.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => resumeSession(session)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => deleteSession(session.id)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 text-sm rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-800 pt-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Start New</h2>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Step indicator (only when working) */}
        {(sessionId || currentStep !== "situation" || situation) && (
          <div className="flex items-center gap-2 mb-8">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center gap-2">
                <button
                  onClick={() => i <= stepIndex && setCurrentStep(step.key)}
                  disabled={i > stepIndex}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    i === stepIndex
                      ? "bg-emerald-600 text-white"
                      : i < stepIndex
                      ? "bg-zinc-700 text-zinc-200 hover:bg-zinc-600 cursor-pointer"
                      : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    i < stepIndex ? "bg-emerald-500 text-white" : "bg-zinc-700 text-zinc-400"
                  }`}>
                    {i < stepIndex ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  {step.label}
                </button>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-px ${i < stepIndex ? "bg-emerald-600" : "bg-zinc-800"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Situation */}
        {currentStep === "situation" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Describe Your Situation</h2>
              <p className="text-zinc-400">
                Tell us about the video you want to create. Include details like target audience,
                product, emotional tone, and the type of person in the video.
              </p>
            </div>
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="e.g., A 30-year-old blue collar dad in his driveway, frustrated about his back pain, discovering a new CBD cream. Target: men 25-45, tone: relieved and surprised."
              rows={6}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleGeneratePrompt}
              disabled={!situation.trim() || generatingPrompt}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              {generatingPrompt ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Claude is thinking...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Prompt
                </>
              )}
            </button>
          </div>
        )}

        {/* Step 2: Review Prompt */}
        {currentStep === "prompt" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Review & Edit Prompt</h2>
              <p className="text-zinc-400">
                Claude generated this Sora 2 prompt. You can edit it before generating the video.
              </p>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={16}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none leading-relaxed"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep("situation")}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleGenerateVideo}
                disabled={!prompt.trim() || generatingVideo}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {generatingVideo ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate 15s Video
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Video Result */}
        {currentStep === "video" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Video Generation</h2>
              <p className="text-zinc-400 font-mono text-sm">Task ID: {videoTaskId}</p>
            </div>

            {videoStatus ? (
              <div className="space-y-4">
                {(videoStatus.state === "waiting" || videoStatus.state === "queuing" || videoStatus.state === "generating") && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                      <span className="text-white font-medium capitalize">{videoStatus.state}...</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${videoStatus.progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-zinc-400 mt-2">{videoStatus.progress}% complete</p>
                  </div>
                )}

                {videoStatus.state === "success" && (videoStatus.resultUrl || videoLocalPath) && (
                  <div className="space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <video
                        src={videoLocalPath || videoStatus.resultUrl!}
                        controls
                        className="w-full max-h-[500px]"
                      />
                    </div>
                    {videoLocalPath && (
                      <p className="text-xs text-zinc-500">Saved: {videoLocalPath}</p>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setVideoStatus(null);
                          setCurrentStep("prompt");
                        }}
                        className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() => setCurrentStep("character")}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        I Like This — Create Character
                      </button>
                    </div>
                  </div>
                )}

                {videoStatus.state === "fail" && (
                  <div className="bg-red-900/20 border border-red-800 rounded-xl p-6">
                    <p className="text-red-400 font-medium">Video generation failed.</p>
                    <button
                      onClick={() => {
                        setVideoStatus(null);
                        setCurrentStep("prompt");
                      }}
                      className="mt-4 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                <span className="text-zinc-300">Starting video generation...</span>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Character Creation */}
        {currentStep === "character" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Create Character</h2>
              <p className="text-zinc-400">
                Create a reusable character from the video so the same person appears in the next clip.
              </p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Video Task ID</label>
                <p className="px-4 py-3 bg-zinc-800 rounded-lg text-zinc-400 font-mono text-sm">{videoTaskId}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Character Username</label>
                <input
                  type="text"
                  value={characterUsername}
                  onChange={(e) => setCharacterUsername(e.target.value)}
                  placeholder="e.g., driveway_dad_01"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Timestamps (start,end — 1-4s duration)</label>
                <input
                  type="text"
                  value={characterTimestamps}
                  onChange={(e) => setCharacterTimestamps(e.target.value)}
                  placeholder="e.g., 1,4"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-1">Pick a 1-4 second window where the character is clearly visible (e.g., 2,5 or 0.5,3.5)</p>
              </div>
              <button
                onClick={handleCreateCharacter}
                disabled={!characterUsername.trim() || creatingCharacter}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {creatingCharacter ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Character"
                )}
              </button>
            </div>

            {characterTaskId && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
                <p className="text-sm text-zinc-400 font-mono">Character Task: {characterTaskId}</p>
                {characterStatus && (
                  <>
                    {(characterStatus.state === "waiting" || characterStatus.state === "queuing" || characterStatus.state === "generating") && (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                        <span className="text-zinc-300 capitalize">{characterStatus.state}...</span>
                        <span className="text-sm text-zinc-500">{characterStatus.progress}%</span>
                      </div>
                    )}
                    {characterStatus.state === "success" && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="font-medium">Character created: {characterUsername}</span>
                        </div>
                        <button
                          onClick={handleGenerateNextPrompt}
                          disabled={generatingNextPrompt}
                          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                        >
                          {generatingNextPrompt ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Generating next script...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                              Generate Next 15s Script
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {characterStatus.state === "fail" && (
                      <p className="text-red-400">Character creation failed. Try again.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Next 15s */}
        {currentStep === "next" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Next 15 Seconds</h2>
              <p className="text-zinc-400">
                Claude modified the prompt to continue with character <span className="text-emerald-400 font-mono">{characterUsername}</span>.
              </p>
            </div>

            <textarea
              value={nextPrompt}
              onChange={(e) => setNextPrompt(e.target.value)}
              rows={16}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none leading-relaxed"
            />

            {!nextVideoTaskId && (
              <button
                onClick={handleGenerateNextVideo}
                disabled={!nextPrompt.trim() || generatingNextVideo}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {generatingNextVideo ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate Next 15s Video
                  </>
                )}
              </button>
            )}

            {nextVideoTaskId && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400 font-mono">Task ID: {nextVideoTaskId}</p>
                {nextVideoStatus ? (
                  <>
                    {(nextVideoStatus.state === "waiting" || nextVideoStatus.state === "queuing" || nextVideoStatus.state === "generating") && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                          <span className="text-white font-medium capitalize">{nextVideoStatus.state}...</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${nextVideoStatus.progress}%` }}
                          />
                        </div>
                        <p className="text-sm text-zinc-400 mt-2">{nextVideoStatus.progress}% complete</p>
                      </div>
                    )}
                    {nextVideoStatus.state === "success" && (nextVideoStatus.resultUrl || nextVideoLocalPath) && (
                      <div className="space-y-2">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                          <video
                            src={nextVideoLocalPath || nextVideoStatus.resultUrl!}
                            controls
                            className="w-full max-h-[500px]"
                          />
                        </div>
                        {nextVideoLocalPath && (
                          <p className="text-xs text-zinc-500">Saved: {nextVideoLocalPath}</p>
                        )}
                      </div>
                    )}
                    {nextVideoStatus.state === "fail" && (
                      <div className="bg-red-900/20 border border-red-800 rounded-xl p-6">
                        <p className="text-red-400 font-medium">Video generation failed.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                    <span className="text-zinc-300">Starting video generation...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Step = "situation" | "prompt" | "video" | "character" | "next";

interface TaskStatus {
  taskId: string;
  state: "waiting" | "queuing" | "generating" | "success" | "fail";
  progress: number;
  resultUrl: string | null;
}

export default function V2StudioPage() {
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>("situation");

  // Step 1: Situation
  const [situation, setSituation] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Step 2: Prompt
  const [prompt, setPrompt] = useState("");

  // Step 3: Video
  const [videoTaskId, setVideoTaskId] = useState("");
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
  const [nextVideoStatus, setNextVideoStatus] = useState<TaskStatus | null>(null);
  const [generatingNextVideo, setGeneratingNextVideo] = useState(false);
  const nextPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (characterPollingRef.current) clearTimeout(characterPollingRef.current);
      if (nextPollingRef.current) clearTimeout(nextPollingRef.current);
    };
  }, []);

  // Step 1: Generate prompt from situation
  async function handleGeneratePrompt() {
    if (!situation.trim() || generatingPrompt) return;
    setGeneratingPrompt(true);
    try {
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
      pollTaskStatus(data.taskId, setVideoStatus, pollingRef);
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingVideo(false);
    }
  }

  // Generic task polling
  function pollTaskStatus(
    taskId: string,
    setStatus: (s: TaskStatus) => void,
    ref: React.RefObject<ReturnType<typeof setTimeout> | null>
  ) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const status: TaskStatus = await res.json();
        setStatus(status);

        if (status.state === "waiting" || status.state === "queuing" || status.state === "generating") {
          ref.current = setTimeout(poll, 5000);
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
      pollTaskStatus(data.taskId, setCharacterStatus, characterPollingRef);
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
      pollTaskStatus(data.taskId, setNextVideoStatus, nextPollingRef);
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingNextVideo(false);
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
        </div>
      </header>

      {/* Step indicator */}
      <div className="max-w-4xl mx-auto px-6 py-6">
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

            {/* Status */}
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

                {videoStatus.state === "success" && videoStatus.resultUrl && (
                  <div className="space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <video
                        src={videoStatus.resultUrl}
                        controls
                        className="w-full max-h-[500px]"
                      />
                    </div>
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

            {/* Character task status */}
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

            {/* Next video status */}
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
                    {nextVideoStatus.state === "success" && nextVideoStatus.resultUrl && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        <video
                          src={nextVideoStatus.resultUrl}
                          controls
                          className="w-full max-h-[500px]"
                        />
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface VideoJob {
  id: string;
  prompt: string;
  aspectRatio: "portrait" | "landscape";
  duration: "10" | "15";
  taskId: string | null;
  status: "idle" | "submitting" | "waiting" | "queuing" | "generating" | "success" | "fail";
  progress: number;
  resultUrl: string | null;
  localPath: string | null;
}

interface Character {
  id: string;
  name: string;
  sourceTaskId: string;
  sourceVideoUrl: string | null;
  sourceLocalPath: string | null;
  sourcePrompt: string;
  characterTaskId: string;
  status: "creating" | "waiting" | "queuing" | "generating" | "success" | "fail";
  progress: number;
  createdAt: number;
}

function createEmptyJob(): VideoJob {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    aspectRatio: "portrait",
    duration: "15",
    taskId: null,
    status: "idle",
    progress: 0,
    resultUrl: null,
    localPath: null,
  };
}

function generateCharacterName(prompt: string, existingNames: string[]): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from", "that", "this"].includes(w))
    .slice(0, 3);
  const base = words.length > 0 ? words.join("_") : "character";
  let name = base;
  let counter = 1;
  while (existingNames.includes(name)) {
    name = `${base}_${String(counter).padStart(2, "0")}`;
    counter++;
  }
  return name;
}

const MAX_JOBS = 5;
const JOBS_KEY = "v3_jobs";
const CHARACTERS_KEY = "v3_characters";

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadJobs(): VideoJob[] {
  const jobs = loadFromStorage<VideoJob[]>(JOBS_KEY, []);
  // Reset "submitting" status to "idle" since the request was lost on refresh
  return jobs.map((j) => j.status === "submitting" ? { ...j, status: "idle" as const } : j);
}

function saveJobs(jobs: VideoJob[]) {
  saveToStorage(JOBS_KEY, jobs);
}

function loadCharacters(): Character[] {
  return loadFromStorage<Character[]>(CHARACTERS_KEY, []);
}

function saveCharacters(characters: Character[]) {
  saveToStorage(CHARACTERS_KEY, characters);
}

export default function V3WorkbenchPage() {
  const [jobs, setJobs] = useState<VideoJob[]>(() => {
    const loaded = loadJobs();
    return loaded.length > 0 ? loaded : [createEmptyJob()];
  });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());
  const [showCharacters, setShowCharacters] = useState(() => loadCharacters().length > 0);
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const charPollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hasResumedPolling = useRef(false);

  // Save jobs to localStorage whenever they change
  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  // Save characters to localStorage whenever they change
  useEffect(() => {
    saveCharacters(characters);
  }, [characters]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => clearTimeout(timer));
      pollTimers.current.clear();
      charPollTimers.current.forEach((timer) => clearTimeout(timer));
      charPollTimers.current.clear();
    };
  }, []);

  // Resume polling for in-progress jobs and characters on mount
  useEffect(() => {
    if (hasResumedPolling.current) return;
    hasResumedPolling.current = true;

    // Resume video job polling
    const loadedJobs = loadJobs();
    loadedJobs.forEach((job) => {
      if (job.taskId && (job.status === "waiting" || job.status === "queuing" || job.status === "generating")) {
        startPolling(job.id, job.taskId);
      }
    });

    // Resume character polling
    const loadedChars = loadCharacters();
    loadedChars.forEach((char) => {
      if (char.characterTaskId && (char.status === "waiting" || char.status === "queuing" || char.status === "generating")) {
        startCharacterPolling(char.id, char.characterTaskId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateJob = useCallback((jobId: string, updates: Partial<VideoJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...updates } : j)));
  }, []);

  const updateCharacter = useCallback((charId: string, updates: Partial<Character>) => {
    setCharacters((prev) => {
      const updated = prev.map((c) => (c.id === charId ? { ...c, ...updates } : c));
      saveCharacters(updated);
      return updated;
    });
  }, []);

  const addJob = useCallback(() => {
    setJobs((prev) => {
      if (prev.length >= MAX_JOBS) return prev;
      return [...prev, createEmptyJob()];
    });
  }, []);

  const removeJob = useCallback((jobId: string) => {
    const timer = pollTimers.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      pollTimers.current.delete(jobId);
    }
    setJobs((prev) => {
      const updated = prev.filter((j) => j.id !== jobId);
      return updated.length === 0 ? [createEmptyJob()] : updated;
    });
    setSelectedJobId((prev) => (prev === jobId ? null : prev));
  }, []);

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
      console.error("Download failed:", error);
    }
    return null;
  }

  const startPolling = useCallback((jobId: string, taskId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();

        const state = data.state as VideoJob["status"];
        updateJob(jobId, { status: state, progress: data.progress || 0 });

        if (state === "waiting" || state === "queuing" || state === "generating") {
          const timer = setTimeout(poll, 5000);
          pollTimers.current.set(jobId, timer);
        } else if (state === "success" && data.resultUrl) {
          pollTimers.current.delete(jobId);
          updateJob(jobId, { resultUrl: data.resultUrl });
          const localPath = await downloadVideo(data.resultUrl, taskId);
          if (localPath) {
            updateJob(jobId, { localPath });
          }
        } else if (state === "fail") {
          pollTimers.current.delete(jobId);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    const timer = setTimeout(poll, 3000);
    pollTimers.current.set(jobId, timer);
  }, [updateJob]);

  const startCharacterPolling = useCallback((charId: string, taskId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();

        const state = data.state as Character["status"];
        updateCharacter(charId, { status: state, progress: data.progress || 0 });

        if (state === "waiting" || state === "queuing" || state === "generating") {
          const timer = setTimeout(poll, 5000);
          charPollTimers.current.set(charId, timer);
        } else {
          charPollTimers.current.delete(charId);
        }
      } catch (error) {
        console.error("Character polling error:", error);
      }
    };

    const timer = setTimeout(poll, 3000);
    charPollTimers.current.set(charId, timer);
  }, [updateCharacter]);

  const generateVideo = useCallback(async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || !job.prompt.trim()) return;

    updateJob(jobId, { status: "submitting" });

    try {
      const res = await fetch("/api/v3/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: job.prompt.trim(),
          aspect_ratio: job.aspectRatio,
          n_frames: job.duration,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        updateJob(jobId, { status: "idle" });
        return;
      }

      const data = await res.json();
      updateJob(jobId, { taskId: data.taskId, status: "waiting", progress: 0 });
      startPolling(jobId, data.taskId);
    } catch (error) {
      alert(`Failed: ${error}`);
      updateJob(jobId, { status: "idle" });
    }
  }, [jobs, updateJob, startPolling]);

  const createCharacterFromJob = useCallback(async (job: VideoJob) => {
    if (!job.taskId || job.status !== "success") return;

    const name = generateCharacterName(job.prompt, characters.map((c) => c.name));
    const charId = crypto.randomUUID();

    const newChar: Character = {
      id: charId,
      name,
      sourceTaskId: job.taskId,
      sourceVideoUrl: job.resultUrl,
      sourceLocalPath: job.localPath,
      sourcePrompt: job.prompt,
      characterTaskId: "",
      status: "creating",
      progress: 0,
      createdAt: Date.now(),
    };

    setCharacters((prev) => {
      const updated = [newChar, ...prev];
      saveCharacters(updated);
      return updated;
    });
    setShowCharacters(true);

    try {
      const res = await fetch("/api/v2/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: job.taskId,
          username: name,
          characterPrompt: job.prompt.slice(0, 200),
          timestamps: "1,4",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Character creation failed: ${err.error}`);
        updateCharacter(charId, { status: "fail" });
        return;
      }

      const data = await res.json();
      updateCharacter(charId, { characterTaskId: data.taskId, status: "waiting" });
      startCharacterPolling(charId, data.taskId);
    } catch (error) {
      alert(`Character creation failed: ${error}`);
      updateCharacter(charId, { status: "fail" });
    }
  }, [characters, updateCharacter, startCharacterPolling]);

  const removeCharacter = useCallback((charId: string) => {
    const timer = charPollTimers.current.get(charId);
    if (timer) {
      clearTimeout(timer);
      charPollTimers.current.delete(charId);
    }
    setCharacters((prev) => {
      const updated = prev.filter((c) => c.id !== charId);
      saveCharacters(updated);
      return updated;
    });
  }, []);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const previewJob = selectedJob?.status === "success" ? selectedJob : null;
  const activeCount = jobs.filter((j) => j.status !== "idle" && j.status !== "success" && j.status !== "fail").length;
  const activeCharCount = characters.filter((c) => c.status !== "success" && c.status !== "fail").length;

  function statusBadge(status: VideoJob["status"], progress: number) {
    switch (status) {
      case "idle":
        return null;
      case "submitting":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Submitting...</span>;
      case "waiting":
      case "queuing":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 capitalize">{status}</span>;
      case "generating":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400">{progress}%</span>;
      case "success":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">Done</span>;
      case "fail":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-600/20 text-red-400">Failed</span>;
    }
  }

  function charStatusBadge(char: Character) {
    switch (char.status) {
      case "creating":
        return <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">Starting...</span>;
      case "waiting":
      case "queuing":
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 capitalize">{char.status}</span>;
      case "generating":
        return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400">{char.progress}%</span>;
      case "success":
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">Ready</span>;
      case "fail":
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-600/20 text-red-400">Failed</span>;
    }
  }

  // Check if the selected job already has a character created
  const jobAlreadyHasCharacter = previewJob?.taskId
    ? characters.some((c) => c.sourceTaskId === previewJob.taskId)
    : false;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white">V3 Workbench</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-600/20 text-cyan-400">
              {activeCount} active
            </span>
          </div>
          <button
            onClick={() => setShowCharacters(!showCharacters)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              showCharacters
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Characters ({characters.length})
            {activeCharCount > 0 && (
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6" style={{ minHeight: "calc(100vh - 73px)" }}>
        {/* Left column — Job list */}
        <div className="w-[55%] space-y-4">
          {jobs.map((job, index) => {
            const isActive = job.status !== "idle" && job.status !== "success" && job.status !== "fail";
            const isSelected = selectedJobId === job.id;

            return (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`bg-zinc-900 border rounded-xl p-4 transition-colors cursor-pointer ${
                  isSelected ? "border-cyan-500/50" : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-400">#{index + 1}</span>
                    {statusBadge(job.status, job.progress)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                    disabled={isActive}
                    className="text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Prompt input */}
                {job.status === "idle" || job.status === "fail" ? (
                  <textarea
                    value={job.prompt}
                    onChange={(e) => updateJob(job.id, { prompt: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Enter your Sora prompt..."
                    rows={3}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none mb-3"
                  />
                ) : (
                  <p className="text-sm text-zinc-300 line-clamp-2 mb-3">{job.prompt}</p>
                )}

                {/* Controls row */}
                <div className="flex items-center gap-3">
                  {/* Aspect ratio toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateJob(job.id, { aspectRatio: "portrait" }); }}
                      disabled={isActive}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        job.aspectRatio === "portrait"
                          ? "bg-cyan-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      Portrait
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateJob(job.id, { aspectRatio: "landscape" }); }}
                      disabled={isActive}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        job.aspectRatio === "landscape"
                          ? "bg-cyan-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      Landscape
                    </button>
                  </div>

                  {/* Duration toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateJob(job.id, { duration: "10" }); }}
                      disabled={isActive}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        job.duration === "10"
                          ? "bg-cyan-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      10s
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateJob(job.id, { duration: "15" }); }}
                      disabled={isActive}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        job.duration === "15"
                          ? "bg-cyan-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      15s
                    </button>
                  </div>

                  <div className="flex-1" />

                  {/* Generate / status */}
                  {job.status === "idle" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); generateVideo(job.id); }}
                      disabled={!job.prompt.trim()}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                      Generate
                    </button>
                  )}
                  {job.status === "fail" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); updateJob(job.id, { status: "idle", taskId: null, progress: 0 }); }}
                      className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Retry
                    </button>
                  )}
                  {isActive && (
                    <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  )}
                </div>

                {/* Progress bar */}
                {isActive && (
                  <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 transition-all duration-500"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}

                {/* Task ID */}
                {job.taskId && (
                  <p className="text-xs text-zinc-600 mt-2 font-mono truncate">{job.taskId}</p>
                )}
              </div>
            );
          })}

          {/* Add job button */}
          {jobs.length < MAX_JOBS && (
            <button
              onClick={addJob}
              className="w-full py-3 border-2 border-dashed border-zinc-800 hover:border-cyan-500/30 rounded-xl text-zinc-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Video ({jobs.length}/{MAX_JOBS})
            </button>
          )}
        </div>

        {/* Right column — Preview + Characters */}
        <div className="w-[45%]">
          <div className="sticky top-24 space-y-4">
            {/* Video Preview */}
            {previewJob ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <video
                  key={previewJob.resultUrl || previewJob.localPath}
                  src={previewJob.resultUrl || previewJob.localPath || undefined}
                  controls
                  autoPlay
                  className="w-full"
                />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">
                      {previewJob.aspectRatio} / {previewJob.duration}s
                    </span>
                  </div>
                  {previewJob.taskId && (
                    <p className="text-xs text-zinc-500 font-mono truncate">Task: {previewJob.taskId}</p>
                  )}
                  {previewJob.localPath && (
                    <p className="text-xs text-zinc-500 truncate">Saved: {previewJob.localPath}</p>
                  )}

                  {/* Create Character button */}
                  {!jobAlreadyHasCharacter ? (
                    <button
                      onClick={() => createCharacterFromJob(previewJob)}
                      className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Create Character
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-purple-400 text-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Character created from this video
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-900/50 border-2 border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center py-32 text-center">
                <svg className="w-12 h-12 text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-zinc-500 text-sm">Click a completed video to preview</p>
                <p className="text-zinc-600 text-xs mt-1">Videos will appear here when ready</p>
              </div>
            )}

            {/* Character Gallery */}
            {showCharacters && characters.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Characters
                </h3>
                <div className="space-y-2">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                    >
                      {/* Video thumbnail */}
                      <div className="w-14 h-10 bg-zinc-700 rounded-md overflow-hidden flex-shrink-0">
                        {(char.sourceVideoUrl || char.sourceLocalPath) ? (
                          <video
                            src={char.sourceVideoUrl || char.sourceLocalPath || undefined}
                            muted
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">@{char.name}</p>
                          {charStatusBadge(char)}
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{char.sourcePrompt}</p>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeCharacter(char.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

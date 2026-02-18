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

interface V2Project {
  id: string;
  name: string;
  situation: string;
  prompt: string | null;
  videoTaskId: string | null;
  videoUrl: string | null;
  videoLocalPath: string | null;
  characterUsername: string | null;
  characterPrompt: string | null;
  characterTaskId: string | null;
  characterTimestamps: string | null;
  safetyInstruction: string | null;
  nextPrompt: string | null;
  nextVideoTaskId: string | null;
  nextVideoUrl: string | null;
  nextVideoLocalPath: string | null;
  step: string;
  createdAt: string;
  updatedAt: string;
}

export default function V2StudioPage() {
  // Project management
  const [projects, setProjects] = useState<V2Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showingProject, setShowingProject] = useState(false);

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
  const [characterPrompt, setCharacterPrompt] = useState("");
  const [characterTimestamps, setCharacterTimestamps] = useState("1,4");
  const [safetyInstruction, setSafetyInstruction] = useState("");
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

  useEffect(() => {
    fetchProjects();
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (characterPollingRef.current) clearTimeout(characterPollingRef.current);
      if (nextPollingRef.current) clearTimeout(nextPollingRef.current);
    };
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/v2/sessions");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoadingProjects(false);
    }
  }

  const saveProject = useCallback(async (updates: Record<string, unknown>) => {
    if (!projectId) return;
    try {
      await fetch(`/api/v2/sessions/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  }, [projectId]);

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

  function openProject(project: V2Project) {
    setProjectId(project.id);
    setProjectName(project.name);
    setSituation(project.situation);
    setPrompt(project.prompt || "");
    setVideoTaskId(project.videoTaskId || "");
    setVideoUrl(project.videoUrl || "");
    setVideoLocalPath(project.videoLocalPath || "");
    setCharacterUsername(project.characterUsername || "");
    setCharacterPrompt(project.characterPrompt || "");
    setCharacterTimestamps(project.characterTimestamps || "1,4");
    setSafetyInstruction(project.safetyInstruction || "");
    setCharacterTaskId(project.characterTaskId || "");
    setNextPrompt(project.nextPrompt || "");
    setNextVideoTaskId(project.nextVideoTaskId || "");
    setNextVideoUrl(project.nextVideoUrl || "");
    setNextVideoLocalPath(project.nextVideoLocalPath || "");
    setCurrentStep(project.step as Step);
    setShowingProject(true);

    // Restore video status for completed videos
    if (project.videoUrl || project.videoLocalPath) {
      setVideoStatus({
        taskId: project.videoTaskId || "",
        state: "success",
        progress: 100,
        resultUrl: project.videoLocalPath || project.videoUrl,
      });
    }
    if (project.nextVideoUrl || project.nextVideoLocalPath) {
      setNextVideoStatus({
        taskId: project.nextVideoTaskId || "",
        state: "success",
        progress: 100,
        resultUrl: project.nextVideoLocalPath || project.nextVideoUrl,
      });
    }

    // Resume polling for in-progress tasks
    if (project.videoTaskId && !project.videoUrl) {
      pollTaskStatus(project.videoTaskId, setVideoStatus, pollingRef, "video");
    }
    if (project.characterTaskId && project.step === "character" && !project.nextPrompt) {
      pollTaskStatus(project.characterTaskId, setCharacterStatus, characterPollingRef, "character");
    }
    if (project.nextVideoTaskId && !project.nextVideoUrl) {
      pollTaskStatus(project.nextVideoTaskId, setNextVideoStatus, nextPollingRef, "nextVideo");
    }
  }

  function backToList() {
    setProjectId(null);
    setProjectName("");
    setSituation("");
    setPrompt("");
    setVideoTaskId("");
    setVideoUrl("");
    setVideoLocalPath("");
    setVideoStatus(null);
    setCharacterUsername("");
    setCharacterPrompt("");
    setCharacterTimestamps("1,4");
    setSafetyInstruction("");
    setCharacterTaskId("");
    setCharacterStatus(null);
    setNextPrompt("");
    setNextVideoTaskId("");
    setNextVideoUrl("");
    setNextVideoLocalPath("");
    setNextVideoStatus(null);
    setCurrentStep("situation");
    setShowingProject(false);
    fetchProjects();
  }

  // Step 1: Generate prompt
  async function handleGeneratePrompt() {
    if (!situation.trim() || generatingPrompt) return;
    setGeneratingPrompt(true);
    try {
      // Create project if new
      let pid = projectId;
      if (!pid) {
        const name = projectName.trim() || situation.trim().slice(0, 50);
        const createRes = await fetch("/api/v2/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, situation: situation.trim() }),
        });
        if (!createRes.ok) throw new Error("Failed to create project");
        const project = await createRes.json();
        pid = project.id;
        setProjectId(pid);
        setProjectName(name);
        setShowingProject(true);
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

      await fetch(`/api/v2/sessions/${pid}`, {
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

  // Step 2: Generate video
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

      await saveProject({ videoTaskId: data.taskId, step: "video", prompt: prompt.trim() });
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingVideo(false);
    }
  }

  // Task polling with auto-download
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
          if (type === "video") {
            const localPath = await downloadVideo(status.resultUrl, taskId);
            setVideoUrl(status.resultUrl);
            if (localPath) setVideoLocalPath(localPath);
            await saveProject({ videoUrl: status.resultUrl, videoLocalPath: localPath });
          } else if (type === "nextVideo") {
            const localPath = await downloadVideo(status.resultUrl, taskId);
            setNextVideoUrl(status.resultUrl);
            if (localPath) setNextVideoLocalPath(localPath);
            await saveProject({ nextVideoUrl: status.resultUrl, nextVideoLocalPath: localPath, step: "next" });
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
    if (!characterPrompt.trim() || creatingCharacter) return;
    setCreatingCharacter(true);
    setCharacterStatus(null);
    try {
      const res = await fetch("/api/v2/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: videoTaskId,
          username: characterUsername.trim() || undefined,
          characterPrompt: characterPrompt.trim(),
          timestamps: characterTimestamps.trim(),
          safetyInstruction: safetyInstruction.trim() || undefined,
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

      await saveProject({
        characterUsername: characterUsername.trim(),
        characterPrompt: characterPrompt.trim(),
        characterTaskId: data.taskId,
        characterTimestamps: characterTimestamps.trim(),
        safetyInstruction: safetyInstruction.trim() || null,
        step: "character",
      });
    } catch (error) {
      alert(`Failed to create character: ${error}`);
    } finally {
      setCreatingCharacter(false);
    }
  }

  // Step 5: Generate next prompt
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
      await saveProject({ nextPrompt: data.prompt, step: "next" });
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
      await saveProject({ nextVideoTaskId: data.taskId, nextPrompt: nextPrompt.trim() });
    } catch (error) {
      alert(`Failed to generate video: ${error}`);
    } finally {
      setGeneratingNextVideo(false);
    }
  }

  async function deleteProject(id: string) {
    try {
      await fetch(`/api/v2/sessions/${id}`, { method: "DELETE" });
      setProjects(projects.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
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

  // ==================== PROJECT LIST VIEW ====================
  if (!showingProject) {
    return (
      <div className="min-h-screen bg-zinc-950">
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

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* New project form */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g., CBD Cream Ad — Blue Collar Dad"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Situation</label>
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="e.g., A 30-year-old blue collar dad in his driveway, frustrated about his back pain, discovering a new CBD cream. Target: men 25-45, tone: relieved and surprised."
                  rows={4}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>
              <button
                onClick={() => {
                  setShowingProject(true);
                  handleGeneratePrompt();
                }}
                disabled={!situation.trim() || generatingPrompt}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {generatingPrompt ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create & Generate Prompt
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Project list */}
          {loadingProjects ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Your Projects</h2>
              <div className="space-y-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      <div className="w-24 h-16 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                        {(project.videoLocalPath || project.videoUrl) ? (
                          <video
                            src={project.videoLocalPath || project.videoUrl!}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{project.name}</h3>
                        <p className="text-sm text-zinc-400 truncate mt-0.5">{project.situation}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            project.step === "next" ? "bg-emerald-600/20 text-emerald-400" :
                            project.step === "character" ? "bg-purple-600/20 text-purple-400" :
                            project.step === "video" ? "bg-blue-600/20 text-blue-400" :
                            project.step === "prompt" ? "bg-yellow-600/20 text-yellow-400" :
                            "bg-zinc-700 text-zinc-400"
                          }`}>
                            {project.step}
                          </span>
                          {project.characterUsername && (
                            <span className="text-xs text-zinc-500">@{project.characterUsername}</span>
                          )}
                          <span className="text-xs text-zinc-600">
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => openProject(project)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="px-3 py-2 bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 text-sm rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ==================== PROJECT WORKSPACE VIEW ====================
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={backToList} className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{projectName || "New Project"}</h1>
              <p className="text-xs text-zinc-500 truncate max-w-md">{situation}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Step indicator */}
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

            {videoStatus ? (
              <div className="space-y-4">
                {(videoStatus.state === "waiting" || videoStatus.state === "queuing" || videoStatus.state === "generating") && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                      <span className="text-white font-medium capitalize">{videoStatus.state}...</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${videoStatus.progress}%` }} />
                    </div>
                    <p className="text-sm text-zinc-400 mt-2">{videoStatus.progress}% complete</p>
                  </div>
                )}

                {videoStatus.state === "success" && (videoStatus.resultUrl || videoLocalPath) && (
                  <div className="space-y-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      <video src={videoLocalPath || videoStatus.resultUrl!} controls className="w-full max-h-[500px]" />
                    </div>
                    {videoLocalPath && <p className="text-xs text-zinc-500">Saved: {videoLocalPath}</p>}
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setVideoStatus(null); setCurrentStep("prompt"); }}
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
                      onClick={() => { setVideoStatus(null); setCurrentStep("prompt"); }}
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
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Character Prompt <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={characterPrompt}
                  onChange={(e) => setCharacterPrompt(e.target.value)}
                  placeholder="e.g., cheerful barista, green apron, warm smile"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-1">One short line describing stable traits — appearance, clothing, expression. No camera directions.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Timestamps <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={characterTimestamps}
                  onChange={(e) => setCharacterTimestamps(e.target.value)}
                  placeholder="e.g., 1,4"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-1">Start and end in seconds (e.g., &quot;2,5&quot;). Must be 1-4s long. Pick where the character is clearly visible.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Character Username (optional)</label>
                <input
                  type="text"
                  value={characterUsername}
                  onChange={(e) => setCharacterUsername(e.target.value)}
                  placeholder="e.g., driveway_dad_01"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-1">Globally unique handle. Reference in prompts with @username. Max 40 chars.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Safety Instruction (optional)</label>
                <input
                  type="text"
                  value={safetyInstruction}
                  onChange={(e) => setSafetyInstruction(e.target.value)}
                  placeholder="e.g., no violence, politics, or alcohol; PG-13 max"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-zinc-500 mt-1">Content boundaries for the character model.</p>
              </div>

              <button
                onClick={handleCreateCharacter}
                disabled={!characterPrompt.trim() || !characterTimestamps.trim() || creatingCharacter}
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
                          <span className="font-medium">
                            Character created{characterUsername ? `: @${characterUsername}` : ""}
                          </span>
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
                Claude modified the prompt to continue with character
                {characterUsername ? <span className="text-emerald-400 font-mono"> @{characterUsername}</span> : ""}.
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
                          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${nextVideoStatus.progress}%` }} />
                        </div>
                        <p className="text-sm text-zinc-400 mt-2">{nextVideoStatus.progress}% complete</p>
                      </div>
                    )}
                    {nextVideoStatus.state === "success" && (nextVideoStatus.resultUrl || nextVideoLocalPath) && (
                      <div className="space-y-2">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                          <video src={nextVideoLocalPath || nextVideoStatus.resultUrl!} controls className="w-full max-h-[500px]" />
                        </div>
                        {nextVideoLocalPath && <p className="text-xs text-zinc-500">Saved: {nextVideoLocalPath}</p>}
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

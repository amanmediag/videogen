"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface V3Video {
  id: string;
  projectId: string;
  prompt: string;
  aspectRatio: string;
  duration: string;
  taskId: string | null;
  status: string;
  progress: number;
  resultUrl: string | null;
  localPath: string | null;
  characterName: string | null;
  characterTaskId: string | null;
  characterStatus: string | null;
  characterProgress: number | null;
  createdAt: string;
  updatedAt: string;
}

interface V3Project {
  id: string;
  name: string;
  videos: V3Video[];
  createdAt: string;
  updatedAt: string;
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

const MAX_VIDEOS = 5;

export default function V3WorkbenchPage() {
  // Project list state
  const [projects, setProjects] = useState<V3Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // Active project state
  const [activeProject, setActiveProject] = useState<V3Project | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showCharacters, setShowCharacters] = useState(false);

  // Draft row (not yet saved to DB)
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftAspect, setDraftAspect] = useState<"portrait" | "landscape">("portrait");
  const [draftDuration, setDraftDuration] = useState<"10" | "15">("15");
  const [showDraft, setShowDraft] = useState(false);

  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const charPollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
    return () => {
      pollTimers.current.forEach((t) => clearTimeout(t));
      charPollTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/v3/projects");
      if (res.ok) setProjects(await res.json());
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoadingProjects(false);
    }
  }

  async function createProject() {
    if (!newProjectName.trim() || creatingProject) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/v3/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects((prev) => [project, ...prev]);
        setNewProjectName("");
        openProject(project);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setCreatingProject(false);
    }
  }

  async function deleteProject(id: string) {
    try {
      await fetch(`/api/v3/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  }

  function openProject(project: V3Project) {
    // Clear any existing timers
    pollTimers.current.forEach((t) => clearTimeout(t));
    pollTimers.current.clear();
    charPollTimers.current.forEach((t) => clearTimeout(t));
    charPollTimers.current.clear();

    setActiveProject(project);
    setSelectedVideoId(null);
    setShowDraft(false);
    setDraftPrompt("");
    setShowCharacters(project.videos.some((v) => v.characterName));

    // Resume polling for in-progress videos
    project.videos.forEach((video) => {
      if (video.taskId && ["waiting", "queuing", "generating"].includes(video.status)) {
        startVideoPolling(project.id, video.id, video.taskId);
      }
      if (video.characterTaskId && video.characterStatus && ["waiting", "queuing", "generating"].includes(video.characterStatus)) {
        startCharPolling(project.id, video.id, video.characterTaskId);
      }
    });
  }

  function backToList() {
    pollTimers.current.forEach((t) => clearTimeout(t));
    pollTimers.current.clear();
    charPollTimers.current.forEach((t) => clearTimeout(t));
    charPollTimers.current.clear();
    setActiveProject(null);
    setSelectedVideoId(null);
    fetchProjects();
  }

  // Update a video in local state
  const updateVideoLocal = useCallback((videoId: string, updates: Partial<V3Video>) => {
    setActiveProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        videos: prev.videos.map((v) => (v.id === videoId ? { ...v, ...updates } : v)),
      };
    });
  }, []);

  // PATCH video in DB
  async function patchVideo(projectId: string, videoId: string, data: Record<string, unknown>) {
    try {
      await fetch(`/api/v3/projects/${projectId}/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error("Failed to patch video:", error);
    }
  }

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

  const startVideoPolling = useCallback((projectId: string, videoId: string, taskId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();

        updateVideoLocal(videoId, { status: data.state, progress: data.progress || 0 });
        await patchVideo(projectId, videoId, { status: data.state, progress: data.progress || 0 });

        if (["waiting", "queuing", "generating"].includes(data.state)) {
          pollTimers.current.set(videoId, setTimeout(poll, 5000));
        } else if (data.state === "success" && data.resultUrl) {
          pollTimers.current.delete(videoId);
          updateVideoLocal(videoId, { resultUrl: data.resultUrl });
          await patchVideo(projectId, videoId, { resultUrl: data.resultUrl });
          const localPath = await downloadVideo(data.resultUrl, taskId);
          if (localPath) {
            updateVideoLocal(videoId, { localPath });
            await patchVideo(projectId, videoId, { localPath });
          }
        } else {
          pollTimers.current.delete(videoId);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    pollTimers.current.set(videoId, setTimeout(poll, 3000));
  }, [updateVideoLocal]);

  const startCharPolling = useCallback((projectId: string, videoId: string, taskId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/v2/task-status/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();

        updateVideoLocal(videoId, { characterStatus: data.state, characterProgress: data.progress || 0 });
        await patchVideo(projectId, videoId, { characterStatus: data.state, characterProgress: data.progress || 0 });

        if (["waiting", "queuing", "generating"].includes(data.state)) {
          charPollTimers.current.set(videoId, setTimeout(poll, 5000));
        } else {
          charPollTimers.current.delete(videoId);
        }
      } catch (error) {
        console.error("Char polling error:", error);
      }
    };
    charPollTimers.current.set(videoId, setTimeout(poll, 3000));
  }, [updateVideoLocal]);

  // Add a new video to the project
  async function addVideo() {
    if (!activeProject || !draftPrompt.trim()) return;

    try {
      const res = await fetch(`/api/v3/projects/${activeProject.id}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: draftPrompt.trim(),
          aspectRatio: draftAspect,
          duration: draftDuration,
        }),
      });
      if (res.ok) {
        const video: V3Video = await res.json();
        setActiveProject((prev) => prev ? { ...prev, videos: [...prev.videos, video] } : prev);
        setDraftPrompt("");
        setShowDraft(false);
      }
    } catch (error) {
      console.error("Failed to add video:", error);
    }
  }

  async function removeVideo(videoId: string) {
    if (!activeProject) return;
    const timer = pollTimers.current.get(videoId);
    if (timer) { clearTimeout(timer); pollTimers.current.delete(videoId); }
    const cTimer = charPollTimers.current.get(videoId);
    if (cTimer) { clearTimeout(cTimer); charPollTimers.current.delete(videoId); }

    try {
      await fetch(`/api/v3/projects/${activeProject.id}/videos/${videoId}`, { method: "DELETE" });
      setActiveProject((prev) => prev ? { ...prev, videos: prev.videos.filter((v) => v.id !== videoId) } : prev);
      if (selectedVideoId === videoId) setSelectedVideoId(null);
    } catch (error) {
      console.error("Failed to remove video:", error);
    }
  }

  async function generateVideo(video: V3Video) {
    if (!activeProject || !video.prompt.trim()) return;

    updateVideoLocal(video.id, { status: "submitting" });

    try {
      const res = await fetch("/api/v3/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: video.prompt.trim(),
          aspect_ratio: video.aspectRatio,
          n_frames: video.duration,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        updateVideoLocal(video.id, { status: "idle" });
        return;
      }

      const data = await res.json();
      updateVideoLocal(video.id, { taskId: data.taskId, status: "waiting", progress: 0 });
      await patchVideo(activeProject.id, video.id, { taskId: data.taskId, status: "waiting", progress: 0 });
      startVideoPolling(activeProject.id, video.id, data.taskId);
    } catch (error) {
      alert(`Failed: ${error}`);
      updateVideoLocal(video.id, { status: "idle" });
    }
  }

  async function createCharacterFromVideo(video: V3Video) {
    if (!activeProject || !video.taskId || video.status !== "success") return;

    const existingNames = activeProject.videos
      .filter((v) => v.characterName)
      .map((v) => v.characterName!);
    const name = generateCharacterName(video.prompt, existingNames);

    updateVideoLocal(video.id, { characterName: name, characterStatus: "creating", characterProgress: 0 });
    setShowCharacters(true);

    try {
      const res = await fetch("/api/v2/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: video.taskId,
          username: name,
          characterPrompt: video.prompt.slice(0, 200),
          timestamps: "1,4",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Character creation failed: ${err.error}`);
        updateVideoLocal(video.id, { characterStatus: "fail" });
        await patchVideo(activeProject.id, video.id, { characterName: name, characterStatus: "fail" });
        return;
      }

      const data = await res.json();
      updateVideoLocal(video.id, { characterTaskId: data.taskId, characterStatus: "waiting" });
      await patchVideo(activeProject.id, video.id, {
        characterName: name,
        characterTaskId: data.taskId,
        characterStatus: "waiting",
      });
      startCharPolling(activeProject.id, video.id, data.taskId);
    } catch (error) {
      alert(`Character creation failed: ${error}`);
      updateVideoLocal(video.id, { characterStatus: "fail" });
      await patchVideo(activeProject.id, video.id, { characterName: name, characterStatus: "fail" });
    }
  }

  // Derived state
  const selectedVideo = activeProject?.videos.find((v) => v.id === selectedVideoId);
  const previewVideo = selectedVideo?.status === "success" ? selectedVideo : null;
  const activeCount = activeProject?.videos.filter((v) =>
    !["idle", "success", "fail"].includes(v.status)
  ).length ?? 0;
  const characterVideos = activeProject?.videos.filter((v) => v.characterName) ?? [];

  function statusBadge(status: string, progress: number) {
    switch (status) {
      case "idle": return null;
      case "submitting": return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">Submitting...</span>;
      case "waiting": case "queuing": return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 capitalize">{status}</span>;
      case "generating": return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400">{progress}%</span>;
      case "success": return <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">Done</span>;
      case "fail": return <span className="text-xs px-2 py-0.5 rounded-full bg-red-600/20 text-red-400">Failed</span>;
      default: return null;
    }
  }

  function charBadge(status: string | null, progress: number | null) {
    switch (status) {
      case "creating": return <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">Starting...</span>;
      case "waiting": case "queuing": return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 capitalize">{status}</span>;
      case "generating": return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400">{progress ?? 0}%</span>;
      case "success": return <span className="text-xs px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">Ready</span>;
      case "fail": return <span className="text-xs px-1.5 py-0.5 rounded bg-red-600/20 text-red-400">Failed</span>;
      default: return null;
    }
  }

  // ==================== PROJECT LIST VIEW ====================
  if (!activeProject) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
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
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* New project */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="Project name..."
                className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button
                onClick={createProject}
                disabled={!newProjectName.trim() || creatingProject}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {creatingProject ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                Create
              </button>
            </div>
          </div>

          {/* Project list */}
          {loadingProjects ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((project) => {
                const firstVideo = project.videos.find((v) => v.resultUrl || v.localPath);
                return (
                  <div
                    key={project.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                        {firstVideo ? (
                          <video
                            src={firstVideo.resultUrl || firstVideo.localPath || undefined}
                            muted
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{project.name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-zinc-500">{project.videos.length} video{project.videos.length !== 1 ? "s" : ""}</span>
                          <span className="text-xs text-zinc-600">{new Date(project.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => openProject(project)}
                          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
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
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-zinc-500">
              <p>No projects yet. Create one above.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== PROJECT WORKSPACE VIEW ====================
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={backToList} className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">{activeProject.name}</h1>
              <p className="text-xs text-zinc-500">{activeProject.videos.length} video{activeProject.videos.length !== 1 ? "s" : ""}</p>
            </div>
            {activeCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-600/20 text-cyan-400">
                {activeCount} active
              </span>
            )}
          </div>
          {characterVideos.length > 0 && (
            <button
              onClick={() => setShowCharacters(!showCharacters)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                showCharacters ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Characters ({characterVideos.length})
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6" style={{ minHeight: "calc(100vh - 73px)" }}>
        {/* Left column — Video list */}
        <div className="w-[55%] space-y-4">
          {activeProject.videos.map((video, index) => {
            const isActive = !["idle", "success", "fail"].includes(video.status);
            const isSelected = selectedVideoId === video.id;

            return (
              <div
                key={video.id}
                onClick={() => setSelectedVideoId(video.id)}
                className={`bg-zinc-900 border rounded-xl p-4 transition-colors cursor-pointer ${
                  isSelected ? "border-cyan-500/50" : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-400">#{index + 1}</span>
                    {statusBadge(video.status, video.progress)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeVideo(video.id); }}
                    disabled={isActive}
                    className="text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <p className="text-sm text-zinc-300 line-clamp-2 mb-3">{video.prompt}</p>

                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600/20 text-cyan-400">
                    {video.aspectRatio === "portrait" ? "Portrait" : "Landscape"}
                  </span>
                  <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-400">
                    {video.duration}s
                  </span>
                  <div className="flex-1" />

                  {video.status === "idle" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); generateVideo(video); }}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                      Generate
                    </button>
                  )}
                  {video.status === "fail" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateVideoLocal(video.id, { status: "idle", taskId: null, progress: 0 });
                        patchVideo(activeProject.id, video.id, { status: "idle", taskId: null, progress: 0 });
                      }}
                      className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Retry
                    </button>
                  )}
                  {isActive && (
                    <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  )}
                </div>

                {isActive && (
                  <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${video.progress}%` }} />
                  </div>
                )}

                {video.taskId && (
                  <p className="text-xs text-zinc-600 mt-2 font-mono truncate">{video.taskId}</p>
                )}
              </div>
            );
          })}

          {/* Draft row for adding new video */}
          {showDraft ? (
            <div className="bg-zinc-900 border border-dashed border-cyan-500/30 rounded-xl p-4 space-y-3">
              <textarea
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder="Enter your Sora prompt..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              />
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                  <button
                    onClick={() => setDraftAspect("portrait")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      draftAspect === "portrait" ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >Portrait</button>
                  <button
                    onClick={() => setDraftAspect("landscape")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      draftAspect === "landscape" ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >Landscape</button>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                  <button
                    onClick={() => setDraftDuration("10")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      draftDuration === "10" ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >10s</button>
                  <button
                    onClick={() => setDraftDuration("15")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      draftDuration === "15" ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >15s</button>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => { setShowDraft(false); setDraftPrompt(""); }}
                  className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                >Cancel</button>
                <button
                  onClick={addVideo}
                  disabled={!draftPrompt.trim()}
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium transition-colors"
                >Add Video</button>
              </div>
            </div>
          ) : (
            activeProject.videos.length < MAX_VIDEOS && (
              <button
                onClick={() => setShowDraft(true)}
                className="w-full py-3 border-2 border-dashed border-zinc-800 hover:border-cyan-500/30 rounded-xl text-zinc-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Video ({activeProject.videos.length}/{MAX_VIDEOS})
              </button>
            )
          )}
        </div>

        {/* Right column — Preview + Characters */}
        <div className="w-[45%]">
          <div className="sticky top-24 space-y-4">
            {previewVideo ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <video
                  key={previewVideo.resultUrl || previewVideo.localPath}
                  src={previewVideo.resultUrl || previewVideo.localPath || undefined}
                  controls
                  autoPlay
                  className="w-full"
                />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">
                      {previewVideo.aspectRatio} / {previewVideo.duration}s
                    </span>
                  </div>
                  {previewVideo.taskId && (
                    <p className="text-xs text-zinc-500 font-mono truncate">Task: {previewVideo.taskId}</p>
                  )}
                  {previewVideo.localPath && (
                    <p className="text-xs text-zinc-500 truncate">Saved: {previewVideo.localPath}</p>
                  )}

                  {!previewVideo.characterName ? (
                    <button
                      onClick={() => createCharacterFromVideo(previewVideo)}
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
                      Character: @{previewVideo.characterName}
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
            {showCharacters && characterVideos.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Characters
                </h3>
                <div className="space-y-2">
                  {characterVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="w-14 h-10 bg-zinc-700 rounded-md overflow-hidden flex-shrink-0">
                        {(video.resultUrl || video.localPath) ? (
                          <video
                            src={video.resultUrl || video.localPath || undefined}
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">@{video.characterName}</p>
                          {charBadge(video.characterStatus, video.characterProgress)}
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{video.prompt}</p>
                      </div>
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

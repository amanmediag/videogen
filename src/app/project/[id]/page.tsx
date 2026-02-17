"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Script {
  id: string;
  version: number;
  content: string;
  isFinal: boolean;
  createdAt: string;
}

interface StoryboardSection {
  id: string;
  sectionNumber: number;
  description: string;
  visualPrompt: string;
  voiceover: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  status: string;
}

interface Task {
  id: string;
  kieTaskId: string;
  type: string;
  status: string;
  progress: number;
  resultUrl: string | null;
}

interface Project {
  id: string;
  name: string;
  idea: string | null;
  status: string;
  messages: ChatMessage[];
  scripts: Script[];
  storyboardSections: StoryboardSection[];
  tasks: Task[];
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "script" | "storyboard" | "videos">("chat");
  const [streamingMessage, setStreamingMessage] = useState("");
  const [savingScript, setSavingScript] = useState(false);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProject();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [project?.messages, streamingMessage]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!message.trim() || sending || !project) return;

    const userMessage = message.trim();
    setMessage("");
    setSending(true);
    setStreamingMessage("");

    // Optimistically add user message
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setProject({ ...project, messages: [...project.messages, tempUserMessage] });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          message: userMessage,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  fullResponse += parsed.choices[0].delta.content;
                  setStreamingMessage(fullResponse);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // Refresh project to get actual messages from DB
      await fetchProject();
      setStreamingMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  }

  async function saveScript(content: string) {
    setSavingScript(true);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          content,
          isFinal: true,
        }),
      });

      if (res.ok) {
        await fetchProject();
        setActiveTab("script");
      }
    } catch (error) {
      console.error("Failed to save script:", error);
    } finally {
      setSavingScript(false);
    }
  }

  async function generateStoryboard() {
    if (!finalScript || generatingStoryboard) return;

    setGeneratingStoryboard(true);
    try {
      const res = await fetch("/api/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          scriptContent: finalScript.content,
        }),
      });

      if (res.ok) {
        await fetchProject();
        setActiveTab("storyboard");
      }
    } catch (error) {
      console.error("Failed to generate storyboard:", error);
    } finally {
      setGeneratingStoryboard(false);
    }
  }

  async function generateVideo(sectionId: string, prompt: string) {
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          type: "video",
          sectionId,
          input: {
            prompt,
            aspect_ratio: "portrait",
          },
        }),
      });

      if (res.ok) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Failed to create video task:", error);
    }
  }

  async function pollTaskStatus(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        await fetchProject();
      }
    } catch (error) {
      console.error("Failed to poll task:", error);
    }
  }

  function getTaskStatusColor(status: string) {
    switch (status) {
      case "waiting": return "text-zinc-400";
      case "queuing": return "text-yellow-400";
      case "generating": return "text-blue-400";
      case "success": return "text-green-400";
      case "fail": return "text-red-400";
      default: return "text-zinc-400";
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-600 border-t-violet-500 rounded-full"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Project not found</h2>
          <Link href="/" className="text-violet-400 hover:text-violet-300">
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const finalScript = project.scripts.find((s) => s.isFinal) || project.scripts[0];

  return (
    <div className="h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-white">{project.name}</h1>
              <p className="text-sm text-zinc-400">{project.idea || "No description"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-zinc-800 rounded-full text-sm text-zinc-300">
              {project.status}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-1">
          {(["chat", "script", "storyboard", "videos"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" && (
          <div className="h-full flex flex-col">
            {/* Messages */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {project.messages.filter((m) => m.role !== "system").length === 0 && !streamingMessage && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">Start the conversation</h3>
                    <p className="text-zinc-400 text-sm">
                      Describe your video ad idea and I&apos;ll help you create a script, storyboard, and generate videos.
                    </p>
                  </div>
                </div>
              )}

              {project.messages
                .filter((m) => m.role !== "system")
                .map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className="flex flex-col gap-2">
                      <div
                        className={`max-w-2xl px-4 py-3 rounded-2xl ${
                          msg.role === "user"
                            ? "bg-violet-600 text-white"
                            : "bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.role === "assistant" && msg.content.length > 100 && (
                        <button
                          onClick={() => saveScript(msg.content)}
                          disabled={savingScript}
                          className="self-start px-3 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-zinc-300 text-xs rounded-lg transition-colors"
                        >
                          {savingScript ? "Saving..." : "Save as Script"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              {streamingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-2xl px-4 py-3 rounded-2xl bg-zinc-800 text-zinc-100">
                    <p className="whitespace-pre-wrap">{streamingMessage}</p>
                    <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-1"></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 p-4 bg-zinc-900/50">
              <div className="max-w-4xl mx-auto flex gap-3">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Describe your video ad idea..."
                  className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={!message.trim() || sending}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "script" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              {project.scripts.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">No script yet</h3>
                  <p className="text-zinc-400">Chat with the AI to generate a script for your video ad</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Script</h2>
                    {finalScript && (
                      <span className="px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-sm">
                        Version {finalScript.version} {finalScript.isFinal && "• Final"}
                      </span>
                    )}
                  </div>
                  {finalScript && (
                    <>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <pre className="whitespace-pre-wrap text-zinc-300 font-sans leading-relaxed">
                          {finalScript.content}
                        </pre>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={generateStoryboard}
                          disabled={generatingStoryboard}
                          className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                        >
                          {generatingStoryboard ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Generating...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                              </svg>
                              Generate Storyboard
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "storyboard" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              {project.storyboardSections.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">No storyboard yet</h3>
                  <p className="text-zinc-400">Once you have a script, ask the AI to create a storyboard</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-white">Storyboard</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {project.storyboardSections
                      .sort((a, b) => a.sectionNumber - b.sectionNumber)
                      .map((section) => (
                        <div
                          key={section.id}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                        >
                          <div className="aspect-video bg-zinc-800 flex items-center justify-center">
                            {section.videoUrl ? (
                              <video
                                src={section.videoUrl}
                                controls
                                className="w-full h-full object-cover"
                              />
                            ) : section.imageUrl ? (
                              <img
                                src={section.imageUrl}
                                alt={`Section ${section.sectionNumber}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-center text-zinc-500">
                                <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <p className="text-sm">No video</p>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-zinc-400">
                                Section {section.sectionNumber}
                              </span>
                              <span className={`text-xs ${
                                section.status === "ready" ? "text-green-400" :
                                section.status === "generating" ? "text-blue-400" :
                                "text-zinc-500"
                              }`}>
                                {section.status}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-300 line-clamp-2 mb-3">
                              {section.description}
                            </p>
                            {!section.videoUrl && section.status !== "generating" && (
                              <button
                                onClick={() => generateVideo(section.id, section.visualPrompt)}
                                className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
                              >
                                Generate Video
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "videos" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-white">Video Generation Tasks</h2>

                {project.tasks.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">No video tasks yet</h3>
                    <p className="text-zinc-400">Generate videos from your storyboard sections</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {project.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{task.type}</span>
                            <span className={`text-xs ${getTaskStatusColor(task.status)}`}>
                              {task.status}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 font-mono">{task.kieTaskId}</p>
                        </div>

                        {task.status === "generating" && (
                          <div className="w-24">
                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 transition-all"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-zinc-400 text-center mt-1">{task.progress}%</p>
                          </div>
                        )}

                        {task.resultUrl && (
                          <a
                            href={task.resultUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                          >
                            View
                          </a>
                        )}

                        {(task.status === "waiting" || task.status === "queuing" || task.status === "generating") && (
                          <button
                            onClick={() => pollTaskStatus(task.kieTaskId)}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                          >
                            Refresh
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

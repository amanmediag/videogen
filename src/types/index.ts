// kie.ai API types

export interface KieTaskCreateRequest {
  model: string;
  callBackUrl?: string;
  progressCallBackUrl?: string;
  input: Record<string, unknown>;
}

export interface KieTaskCreateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

export interface KieTaskStatusResponse {
  code: number;
  message: string;
  data: {
    taskId: string;
    model: string;
    state: "waiting" | "queuing" | "generating" | "success" | "fail";
    param: string;
    resultJson: string;
    failCode: string;
    failMsg: string;
    completeTime: number;
    createTime: number;
    updateTime: number;
    progress: number;
  };
}

export interface KieTaskResult {
  resultUrls?: string[];
  character_id?: string;
}

export interface KieChatMessage {
  role: "system" | "user" | "assistant";
  content: string | { type: string; text: string }[];
}

export interface KieChatRequest {
  messages: KieChatMessage[];
  stream?: boolean;
  max_tokens?: number;
}

export interface KieChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface KieCreditResponse {
  code: number;
  msg: string;
  data: number;
}

// App types

export type ProjectStatus = "draft" | "scripting" | "storyboarding" | "generating" | "complete";
export type TaskStatus = "waiting" | "queuing" | "generating" | "success" | "fail";
export type SectionStatus = "pending" | "generating" | "ready" | "approved";

export interface VideoGenerateInput {
  prompt: string;
  image_urls?: string[];
  aspect_ratio?: "portrait" | "landscape";
  n_frames?: "10" | "15";
  remove_watermark?: boolean;
  upload_method?: "s3" | "oss";
}

export interface CharacterCreateInput {
  origin_task_id: string;
  timestamps: string;
  character_prompt: string;
  character_user_name?: string;
  safety_instruction?: string;
}

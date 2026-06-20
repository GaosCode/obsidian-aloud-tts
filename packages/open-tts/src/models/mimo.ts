import type { TTSPluginSettings } from "../player/TTSPluginSettings";
import { base64ToArrayBuffer } from "../util/misc";
import type { AudioData } from "./tts-model";
import {
  AudioTextContext,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type ErrorMessage,
  type TTSModel,
  type TTSModelOptions,
  validate200,
} from "./tts-model";

export const MIMO_API_ENDPOINTS = {
  standard: "https://api.xiaomimimo.com/v1",
  "coding-plan-cn": "https://token-plan-cn.xiaomimimo.com/v1",
} as const;

export type MimoApiEndpoint = keyof typeof MIMO_API_ENDPOINTS;

/** @deprecated Use MIMO_API_ENDPOINTS.standard */
export const MIMO_API_URL = MIMO_API_ENDPOINTS.standard;
export const MIMO_TTS_MODEL = "mimo-v2.5-tts";

export function getMimoApiUrl(settings: TTSPluginSettings): string {
  return MIMO_API_ENDPOINTS[settings.mimo_apiEndpoint];
}

export interface MimoVoice {
  label: string;
  value: string;
  language: string;
  gender: string;
}

export const MIMO_PRESET_VOICES: MimoVoice[] = [
  {
    label: "MiMo Default",
    value: "mimo_default",
    language: "Cluster default",
    gender: "",
  },
  { label: "冰糖", value: "冰糖", language: "中文", gender: "女性" },
  { label: "茉莉", value: "茉莉", language: "中文", gender: "女性" },
  { label: "苏打", value: "苏打", language: "中文", gender: "男性" },
  { label: "白桦", value: "白桦", language: "中文", gender: "男性" },
  { label: "Mia", value: "Mia", language: "English", gender: "Female" },
  { label: "Chloe", value: "Chloe", language: "English", gender: "Female" },
  { label: "Milo", value: "Milo", language: "English", gender: "Male" },
  { label: "Dean", value: "Dean", language: "English", gender: "Male" },
];

interface MimoChatCompletionResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
      };
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export const mimoTextToSpeech: TTSModel = {
  call: mimoCallTextToSpeech,
  validateConnection: async (settings) => {
    if (!settings.mimo_apiKey) {
      return REQUIRE_API_KEY;
    }
    return undefined;
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.mimo_apiKey,
      apiUri: getMimoApiUrl(settings),
      voice: settings.mimo_ttsVoice,
      instructions: settings.mimo_ttsInstructions,
      model: MIMO_TTS_MODEL,
    };
  },
};

function buildUserMessage(
  instructions: string | undefined,
  context: AudioTextContext,
): string | undefined {
  let content = instructions?.trim() ?? "";
  if (context.textBefore) {
    if (content) {
      content += "\n\n";
    }
    content +=
      "Maintain tone and pacing with the following speech before this text:\n\n";
    content += context.textBefore;
  }
  return content || undefined;
}

export async function mimoCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  _settings: TTSPluginSettings,
  context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  const userMessage = buildUserMessage(options.instructions, context);
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  messages.push({ role: "assistant", content: text });

  const apiUrl = options.apiUri || MIMO_API_URL;
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "api-key": options.apiKey ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model || MIMO_TTS_MODEL,
      messages,
      audio: {
        format: "wav",
        voice: options.voice || "mimo_default",
      },
    }),
    signal,
  });

  await validate200Mimo(response);
  const json = (await response.json()) as MimoChatCompletionResponse;
  const audioBase64 = json.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error("Mimo response missing audio data");
  }

  return {
    data: base64ToArrayBuffer(audioBase64),
    format: "wav",
  };
}

async function validate200Mimo(response: Response): Promise<void> {
  const getErrorMessage = (body: unknown): ErrorMessage | undefined => {
    const json = body as MimoChatCompletionResponse;
    if (!json.error?.message) {
      return undefined;
    }
    return {
      error: {
        message: json.error.message,
        type: json.error.type || "mimo_error",
        code: json.error.code || "unknown",
        param: null,
      },
    };
  };
  await validate200(response, getErrorMessage);
}

export function parseMimoResponse(
  responseText: string,
  httpStatus: number,
): MimoChatCompletionResponse {
  let json: MimoChatCompletionResponse;
  try {
    json = JSON.parse(responseText) as MimoChatCompletionResponse;
  } catch {
    const detail = responseText.trim().slice(0, 200) || `HTTP ${httpStatus}`;
    if (httpStatus >= 300) {
      throw new TTSErrorInfo(detail, undefined, httpStatus);
    }
    throw new Error(`Mimo response was not valid JSON: ${detail}`);
  }

  if (json.error?.message) {
    throw new TTSErrorInfo(
      json.error.message,
      {
        error: {
          message: json.error.message,
          type: json.error.type || "mimo_error",
          code: json.error.code || "unknown",
          param: null,
        },
      },
      httpStatus >= 300 ? httpStatus : undefined,
    );
  }

  if (httpStatus >= 300) {
    throw new TTSErrorInfo(`HTTP ${httpStatus} error`, undefined, httpStatus);
  }

  return json;
}

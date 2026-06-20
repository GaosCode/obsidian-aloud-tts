import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mimoTextToSpeech,
  mimoCallTextToSpeech,
  parseMimoResponse,
  getMimoApiUrl,
  MIMO_API_ENDPOINTS,
  MIMO_API_URL,
  MIMO_TTS_MODEL,
} from "./mimo";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";
import { TTSModelOptions, TTSErrorInfo } from "./tts-model";

global.fetch = vi.fn();

describe("Mimo Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getMimoApiUrl", () => {
    it("should return the standard endpoint by default", () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        mimo_apiEndpoint: "standard" as const,
      };
      expect(getMimoApiUrl(settings)).toBe(MIMO_API_ENDPOINTS.standard);
    });

    it("should return the coding plan China endpoint when selected", () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        mimo_apiEndpoint: "coding-plan-cn" as const,
      };
      expect(getMimoApiUrl(settings)).toBe(
        MIMO_API_ENDPOINTS["coding-plan-cn"],
      );
    });
  });

  describe("convertToOptions", () => {
    it("should convert settings to options correctly", () => {
      const testSettings = {
        ...DEFAULT_SETTINGS,
        mimo_apiKey: "test-api-key",
        mimo_apiEndpoint: "coding-plan-cn" as const,
        mimo_ttsVoice: "冰糖",
        mimo_ttsInstructions: "Speak warmly.",
      };

      const options = mimoTextToSpeech.convertToOptions(testSettings);

      expect(options).toEqual({
        apiKey: "test-api-key",
        apiUri: MIMO_API_ENDPOINTS["coding-plan-cn"],
        model: MIMO_TTS_MODEL,
        voice: "冰糖",
        instructions: "Speak warmly.",
      });
    });
  });

  describe("validateConnection", () => {
    it("should require API key", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        mimo_apiKey: "",
      };
      const result = await mimoTextToSpeech.validateConnection(settings);
      expect(result).toMatch(/Please enter an API key/i);
    });

    it("returns undefined when API key is present", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        mimo_apiKey: "sk-test",
      };
      const result = await mimoTextToSpeech.validateConnection(settings);
      expect(result).toBeUndefined();
    });
  });

  describe("parseMimoResponse", () => {
    it("should parse a successful response", () => {
      const responseText = JSON.stringify({
        choices: [{ message: { audio: { data: "dGVzdA==" } } }],
      });

      const result = parseMimoResponse(responseText, 200);

      expect(result.choices?.[0]?.message?.audio?.data).toBe("dGVzdA==");
    });

    it("should throw on API error", () => {
      const responseText = JSON.stringify({
        error: {
          message: "invalid api key",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
      });

      expect(() => parseMimoResponse(responseText, 401)).toThrow(TTSErrorInfo);
      expect(() => parseMimoResponse(responseText, 401)).toThrow(
        "invalid api key",
      );
    });

    it("should throw when response is missing audio data on success", () => {
      const responseText = JSON.stringify({
        choices: [{ message: {} }],
      });

      const result = parseMimoResponse(responseText, 200);
      expect(result.choices?.[0]?.message?.audio?.data).toBeUndefined();
    });
  });

  describe("mimoCallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      apiUri: MIMO_API_URL,
      model: MIMO_TTS_MODEL,
      voice: "Chloe",
      instructions: "Bright and upbeat.",
    };

    it("should call chat completions and decode base64 wav audio", async () => {
      const audioBase64 = btoa("wav-audio");
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { audio: { data: audioBase64 } } }],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await mimoCallTextToSpeech(
        "Hello world",
        mockOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${MIMO_API_URL}/chat/completions`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "api-key": "test-api-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MIMO_TTS_MODEL,
            messages: [
              { role: "user", content: "Bright and upbeat." },
              { role: "assistant", content: "Hello world" },
            ],
            audio: {
              format: "wav",
              voice: "Chloe",
            },
          }),
        }),
      );

      expect(new TextDecoder().decode(new Uint8Array(result.data))).toBe(
        "wav-audio",
      );
      expect(result.format).toBe("wav");
    });

    it("should omit user message when no style instructions are provided", async () => {
      const audioBase64 = btoa("wav-audio");
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { audio: { data: audioBase64 } } }],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await mimoCallTextToSpeech(
        "Hello world",
        { ...mockOptions, instructions: undefined },
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${MIMO_API_URL}/chat/completions`,
        expect.objectContaining({
          body: JSON.stringify({
            model: MIMO_TTS_MODEL,
            messages: [{ role: "assistant", content: "Hello world" }],
            audio: {
              format: "wav",
              voice: "Chloe",
            },
          }),
        }),
      );
    });

    it("should call the selected API endpoint", async () => {
      const audioBase64 = btoa("wav-audio");
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { audio: { data: audioBase64 } } }],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const codingPlanUrl = MIMO_API_ENDPOINTS["coding-plan-cn"];
      await mimoCallTextToSpeech(
        "Hello world",
        { ...mockOptions, apiUri: codingPlanUrl },
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${codingPlanUrl}/chat/completions`,
        expect.any(Object),
      );
    });

    it("should throw when response is missing audio data", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: {} }],
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      await expect(
        mimoCallTextToSpeech("Hello world", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("Mimo response missing audio data");
    });
  });
});

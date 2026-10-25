import * as webllm from "@mlc-ai/web-llm";

const GLOBAL_ENGINE_KEY = "__GLOBAL_WEBGPU_MLC_ENGINE__";
const GLOBAL_PROMISE_KEY = "__GLOBAL_WEBGPU_INIT_PROMISE__";

class WebGPULLMManager {
  constructor() {
    this.activeModel = null;
    this.abortController = null;
    this.stopTokens = [
      "<eos>",
      "<end_of_turn>",
      "<start_of_turn>",
      "<|eot_id|>",
      "<|end_of_text|>",
      "</s>",
      "\n\n\n"
    ];
  }

  get engine() {
    if (typeof window !== "undefined") {
      return window[GLOBAL_ENGINE_KEY] || null;
    }
    return null;
  }

  set engine(instance) {
    if (typeof window !== "undefined") {
      window[GLOBAL_ENGINE_KEY] = instance;
    }
  }

  get isReady() {
    return !!this.engine;
  }

  hasWebGPUSupport() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  getCustomAppConfig() {
    const defaultList = webllm.prebuiltAppConfig.model_list;
    const customList = defaultList.map((m) => {
      if (m.model_id.includes("gemma3-1b")) {
        return {
          ...m,
          overrides: {
            ...m.overrides,
            sliding_window_size: -1,
            context_window_size: 2048
          }
        };
      }
      return m;
    });

    return {
      ...webllm.prebuiltAppConfig,
      useIndexedDBCache: true,
      model_list: customList
    };
  }

  async init(onProgress) {
    if (this.engine) {
      if (onProgress) onProgress(`Gemma Ready`, 1.0, this.activeModel || "gemma3-1b-it-q4f16_1-MLC");
      return this.engine;
    }

    if (typeof window !== "undefined" && window[GLOBAL_PROMISE_KEY]) {
      return window[GLOBAL_PROMISE_KEY];
    }

    const initPromise = (async () => {
      if (!this.hasWebGPUSupport()) {
        console.warn("[WebGPU Engine] WebGPU not supported on this device/browser.");
        if (onProgress) onProgress("WebGPU not supported", 0, null);
        return null;
      }

      const customAppConfig = this.getCustomAppConfig();

      const candidateModels = [
        "gemma3-1b-it-q4f16_1-MLC",
        "Llama-3.2-1B-Instruct-q4f16_1-MLC",
        "SmolLM2-360M-Instruct-q4f16_1-MLC"
      ];

      for (const modelId of candidateModels) {
        try {
          console.log(`[WebGPU Engine] Allocating model: ${modelId}`);
          if (onProgress) onProgress(`Loading ${modelId}...`, 0.1, modelId);

          const engine = new webllm.MLCEngine({
            appConfig: customAppConfig,
            initProgressCallback: (report) => {
              if (onProgress) {
                onProgress(report.text, report.progress, modelId);
              }
            }
          });

          await engine.reload(modelId);

          this.engine = engine;
          this.activeModel = modelId;
          console.log(`[WebGPU Engine] Active in GPU VRAM: ${modelId}`);
          if (onProgress) onProgress(`Gemma (${modelId.split('-')[0]}) Ready`, 1.0, modelId);
          return this.engine;
        } catch (err) {
          console.warn(`[WebGPU Engine] Failed initializing ${modelId}:`, err);
        }
      }

      return null;
    })();

    if (typeof window !== "undefined") {
      window[GLOBAL_PROMISE_KEY] = initPromise;
    }

    try {
      return await initPromise;
    } finally {
      if (typeof window !== "undefined") {
        window[GLOBAL_PROMISE_KEY] = null;
      }
    }
  }

  cleanEosTokens(text) {
    if (!text) return "";
    let clean = text;
    for (const token of this.stopTokens) {
      clean = clean.split(token).join("");
    }
    return clean.trim();
  }

  // Interrupt and halt generation immediately
  interrupt() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.engine && this.engine.interruptGenerate) {
      try {
        this.engine.interruptGenerate();
      } catch (e) {
        console.warn("Interrupt error:", e);
      }
    }
  }

  async generateStream(prompt, systemPrompt = "", onChunk) {
    if (!this.engine) {
      await this.init();
    }

    if (!this.engine) {
      throw new Error("WebGPU engine could not be initialized on your GPU.");
    }

    this.abortController = new AbortController();

    try {
      return await this._doGenerate(prompt, systemPrompt, onChunk, this.abortController.signal);
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.log("[WebGPU Engine] Generation stopped by user.");
        return "Generation stopped.";
      }
      if (err.message && (err.message.includes("disposed") || err.message.includes("lost"))) {
        console.warn("[WebGPU Engine] GPU Context reset. Re-acquiring model...");
        this.engine = null;
        await this.init();
        if (this.engine) {
          return await this._doGenerate(prompt, systemPrompt, onChunk, this.abortController.signal);
        }
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  async _doGenerate(prompt, systemPrompt, onChunk, signal) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const chunks = await this.engine.chat.completions.create({
      messages,
      temperature: 0.2,
      top_p: 0.9,
      repetition_penalty: 1.15,
      max_tokens: 300,
      stop: this.stopTokens,
      stream: true
    });

    let fullRawText = "";
    for await (const chunk of chunks) {
      if (signal && signal.aborted) {
        break;
      }
      const delta = chunk.choices[0]?.delta?.content || "";
      if (this.stopTokens.some(token => delta.includes(token))) {
        break;
      }
      fullRawText += delta;
      const sanitized = this.cleanEosTokens(fullRawText);
      if (onChunk) {
        onChunk(delta, sanitized);
      }
    }

    return this.cleanEosTokens(fullRawText);
  }

  async generate(prompt, systemPrompt = "") {
    return this.generateStream(prompt, systemPrompt);
  }
}

export const webGpuLLM = new WebGPULLMManager();

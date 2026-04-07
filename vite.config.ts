import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom")
            ) {
              return "react";
            }
            if (id.includes("@google/genai")) {
              return "ai";
            }
            if (
              id.includes("node_modules/marked") ||
              id.includes("node_modules/katex")
            ) {
              return "markdown";
            }
            return undefined;
          },
        },
      },
    },
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.AI_PROVIDER": JSON.stringify(env.AI_PROVIDER || "gemini"),
      "process.env.QWEN_API_KEY": JSON.stringify(env.QWEN_API_KEY || ""),
      "process.env.QWEN_BASE_URL": JSON.stringify(
        env.QWEN_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ),
      "process.env.GEMINI_MODEL_FAST": JSON.stringify(
        env.GEMINI_MODEL_FAST || "gemini-3.0-flash",
      ),
      "process.env.GEMINI_MODEL_PRO": JSON.stringify(
        env.GEMINI_MODEL_PRO || "gemini-3.1-pro",
      ),
      "process.env.GEMINI_MODEL_IMAGE": JSON.stringify(
        env.GEMINI_MODEL_IMAGE || "imagen-4.0-generate-001",
      ),
      "process.env.QWEN_MODEL_FAST": JSON.stringify(
        env.QWEN_MODEL_FAST || "qwen3.5-flash",
      ),
      "process.env.QWEN_MODEL_PRO": JSON.stringify(
        env.QWEN_MODEL_PRO || "qwen3.6-plus",
      ),
      "process.env.QWEN_MODEL_IMAGE": JSON.stringify(
        env.QWEN_MODEL_IMAGE || "qwen-image-2.0",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});

import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
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
        env.GEMINI_MODEL_FAST || "gemini-2.5-flash",
      ),
      "process.env.GEMINI_MODEL_PRO": JSON.stringify(
        env.GEMINI_MODEL_PRO || "gemini-2.5-pro",
      ),
      "process.env.GEMINI_MODEL_IMAGE": JSON.stringify(
        env.GEMINI_MODEL_IMAGE || "imagen-4.0-generate-001",
      ),
      "process.env.QWEN_MODEL_FAST": JSON.stringify(
        env.QWEN_MODEL_FAST || "qwen-plus",
      ),
      "process.env.QWEN_MODEL_PRO": JSON.stringify(
        env.QWEN_MODEL_PRO || "qwen-max",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});

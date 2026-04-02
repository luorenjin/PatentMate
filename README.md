<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: <https://ai.studio/apps/drive/1w91uOL-lgEkzuEEOpHFH56uKZHtNIY1f>

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Model Provider Configuration

The app supports both Gemini and Qwen providers.

Default (Gemini):

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
```

Switch to Qwen (OpenAI-compatible endpoint):

```bash
AI_PROVIDER=qwen
QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL_FAST=qwen-plus
QWEN_MODEL_PRO=qwen-max
```

Optional model overrides:

```bash
GEMINI_MODEL_FAST=gemini-2.5-flash
GEMINI_MODEL_PRO=gemini-2.5-pro
GEMINI_MODEL_IMAGE=imagen-4.0-generate-001
```

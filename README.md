# 🚇 MetroCircuit AI v6.2 (Multi-Agent RAG)
### Advanced Electrical Drawing Intelligence & Matrix Analytics Engine

MetroCircuit AI is a high-performance RAG (Retrieval-Augmented Generation) system specifically engineered for processing massive electrical schematics and circuit diagrams. It utilizes a custom **Multi-Agent Pipeline** and a **Batch-Processing Engine** to enable high-accuracy analysis of technical drawings.

---

## 🚀 Matrix Analytics Upgrade (v6.2)
The latest version introduces advanced "Multi-Agent" reasoning:
- **Router Agent**: Automatically classifies query intent and expands engineering keywords (e.g., mapping "cables" to wiring specs).
- **Verification Agent**: Post-processes answers to ensure citations, prevent hallucinations, and verify cable details.
- **Scoped Search**: Target specific Folders or Documents directly from the Query UI.
- **Robust API Handling**: Seamlessly fallbacks between Gemini v1/v1beta endpoints to prevent API timeout errors.
- **Security Hardening**: Secrets are now managed via `PropertiesService` (Google) and GitHub Secrets, removing all hardcoded keys.
- **Dynamic Progress**: Real-time frontend polling with page-by-page progress bars.

---

## 🛠️ Connection & Setup

To connect this repository correctly to GitHub and your production environment, follow these steps:

### 1. Environment Secrets (GitHub & Vercel)
Add the following keys to your **GitHub Repository Secrets** (Settings > Secrets and variables > Actions) or your **Vercel Project Environment Variables**:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GOOGLE_SCRIPT_URL` | The deployment URL of your Google Apps Script backend. |
| `GEMINI_API_KEY` | Your Google AI Studio API key. |
| `DRIVE_FOLDER_ID` | The ID of the Google Drive folder where drawings are stored. |

### 2. Google Apps Script Backend
1. Copy the code from `/google-apps-script/Code.gs`.
2. Deploy as a **Web App** (Execute as: Me, Access: Anyone).
3. Ensure the **Drive API v2** service is enabled in the Apps Script project.

### 3. Stitch MCP Integration
This repository includes a pre-configured `stitch-skills/` directory containing 6 essential skills for AI-driven engineering analysis:
- `design-md`, `enhance-prompt`, `react-components`, `remotion`, `shadcn-ui`, `stitch-loop`.

To use these skills locally with the Stitch CLI:
```bash
npx skills add ./stitch-skills --local
```

---

## 📦 Deployment
The project is ready for **Vercel**. Connect your GitHub repository to Vercel, and it will automatically detect the Next.js project and apply your environment variables.

---

## 🧪 CI/CD
A GitHub Action is included in `.github/workflows/ci.yml` to automatically verify builds on every push to `main`.

# Deploying MetroCircuit AI

This guide explains how to securely connect your Gemini API Key and Project Folder ID to both Google Apps Script and GitHub.

## 1. Google Apps Script Security
We have upgraded the backend to use `PropertiesService`. Your API keys are no longer hardcoded in the script.

1.  Open your [Apps Script Project](https://script.google.com/).
2.  Go to **Project Settings** (gear icon on the left).
3.  Scroll down to **Script Properties**.
4.  Add the following properties:
    *   `GEMINI_API_KEY`: Your Google AI Studio API key.
    *   `DRIVE_FOLDER_ID`: The ID of the Google Drive folder where your documents are stored.
5.  Click **Save script properties**.

## 2. GitHub Secrets (CI/CD)
If you are using GitHub Actions for deployment or testing, add your secrets to GitHub:

1.  Go to your GitHub Repository → **Settings** → **Secrets and variables** → **Actions**.
2.  Add **New repository secret**:
    *   Name: `GEMINI_API_KEY`
    *   Value: (Your API Key)
3.  Add another secret:
    *   Name: `DRIVE_FOLDER_ID`
    *   Value: (Your Folder ID)

## 3. Stitch MCP Integration
The `stitch-skills/` directory contains specialized agents for batch processing and engineering analysis. These are automatically included in the repository and used by the backend routing logic.

## 4. Troubleshooting API Errors
If you see "All Gemini models returned errors":
1.  Check that the `GEMINI_API_KEY` property is set correctly in Apps Script.
2.  Ensure you have enabled the **Generative Language API** in the Google Cloud Console associated with your script (or just use a standard AI Studio key).
3.  The backend v6.2 now automatically fallbacks between `v1` and `v1beta` endpoints for maximum compatibility.

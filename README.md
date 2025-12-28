# Strike Girl AI – Don't Trust Blindly

AI-powered VS Code extension featuring an intelligent chatbot that helps you review code, fix issues, and build websites using Google GenAI.

## Features

- 🤖 **Interactive Chatbot Interface** - Clean, user-friendly chatbot panel for seamless interaction
- 🔍 **Automatic Code Review** - Scans and reviews code files in your workspace or specific folders
- 🔧 **Smart Code Fixes** - Automatically fixes security vulnerabilities, bugs, and code quality issues
- 👀 **Preview Changes** - Review code changes before accepting them with a diff preview
- ✅ **Accept/Reject Changes** - Keep All or Undo All changes with a single click
- 📊 **Detailed Reports** - Comprehensive reports showing exactly what was fixed with line numbers
- 🛡️ **Security Scanning** - Detects hardcoded secrets, XSS risks, and injection vulnerabilities
- 🐛 **Bug Detection** - Finds null/undefined errors, missing returns, async problems
- ✨ **Code Quality** - Removes console.logs, unused code, and improves naming
- 🌐 **Website Builder** - Build complete websites from natural language descriptions
- 📁 **Folder-Specific Reviews** - Review specific folders within your workspace

## Requirements

- Node.js (v18+ recommended)
- npm or yarn
- VS Code 1.74.0 or higher
- Google GenAI API Key

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Compile the TypeScript code:**

```bash
npm run compile
```

## Configuration

You need to provide your Google GenAI API Key. You can do this in one of three ways:

### Option 1: Chatbot UI (Recommended)

1. When the extension activates, the chatbot panel will open automatically
2. Enter your Google GenAI API key in the input field at the bottom
3. Click "Save" or press Enter
4. The API key will be securely stored for future use

### Option 2: VS Code Settings

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Strike Girl AI"
3. Enter your API key in the `Strike Girl AI: Api Key` field

### Option 3: Environment Variable

Set the `GOOGLE_GENAI_API_KEY` environment variable:

```bash
# Windows (PowerShell)
$env:GOOGLE_GENAI_API_KEY="your-api-key-here"

# Windows (CMD)
set GOOGLE_GENAI_API_KEY=your-api-key-here

# Linux/Mac
export GOOGLE_GENAI_API_KEY=your-api-key-here
```

**Note:** If an invalid API key is detected, the extension will automatically prompt you to enter a new one.

## Running the Extension Locally

### Method 1: Using F5 (Recommended)

1. **Open the extension folder in VS Code:**

   - Open this extension folder in VS Code

2. **Press `F5`** (or go to `Run > Start Debugging`)

   - This will:
     - Compile the TypeScript code
     - Launch a new Extension Development Host window
     - Load your extension in the new window

3. **In the new Extension Development Host window:**

   - The chatbot panel will open automatically
   - Enter your Google GenAI API key in the chatbot
   - Open a workspace folder with code you want to review
   - Use the chatbot to start code reviews or build websites

4. **View Results:**
   - All results are displayed directly in the chatbot interface
   - Code changes are shown with diff preview
   - Use "Preview Changes" to see changes in VS Code diff editor
   - Use "Keep All" to accept changes or "Undo All" to reject them

### Method 2: Using Watch Mode (For Active Development)

1. **Start watch mode** (auto-compiles on file changes):

```bash
npm run watch
```

2. **In another terminal or VS Code**, press `F5` to launch the extension

3. Any changes you make to `.ts` files will automatically recompile

### Method 3: Manual Compile

1. **Compile manually:**

```bash
npm run compile
```

2. **Press `F5`** to launch the extension

## Usage

### Code Review

1. **Start a Review:**

   - Type "start review" in the chatbot to review the entire workspace
   - Or type "review [folder-name]" to review a specific folder (e.g., "review calculator")
   - The chatbot will scan and analyze your code

2. **Review Changes:**

   - All suggested changes are displayed in the chatbot with red (removed) and green (added) highlights
   - Click "Preview Changes" to open a split-screen diff view in VS Code
   - Review each change carefully

3. **Apply Changes:**
   - Click "Keep All" to accept all changes for a file
   - Click "Undo All" to reject all changes for a file
   - Changes are only applied to your files when you click "Keep All"

### Website Building

1. **Build a Website:**

   - Type "build website: [description]" in the chatbot (e.g., "build website: a calculator app")
   - Or simply describe what you want (e.g., "create a todo app")
   - The chatbot will generate HTML, CSS, and JavaScript files automatically

2. **Review Generated Files:**
   - The chatbot will show progress as files are created
   - All generated files are saved in your workspace

### Chatbot Commands

- `start review` - Review all code in the workspace
- `review [folder-name]` - Review code in a specific folder
- `build website: [description]` - Build a website from description
- `create [project-name]` - Create a new project/website

## Debugging

- **Set Breakpoints**: Click in the gutter next to line numbers in any `.ts` file in the `src/` directory
- **View Console**: Check the Debug Console in VS Code for console.log output
- **Check Output Channel**: View detailed logs in "Strike Girl AI" output channel
- **Reload Extension**: After making changes, stop debugging (`Shift+F5`) and press `F5` again
- **Chatbot State**: The chatbot preserves conversation history when switching tabs (thanks to `retainContextWhenHidden`)

## What Gets Reviewed

The extension automatically scans and fixes:

- **HTML**: Missing doctype, semantic HTML, accessibility issues, missing alt attributes, broken links
- **CSS**: Syntax errors, browser compatibility, inefficient selectors, unused/duplicate styles, missing vendor prefixes
- **JavaScript/TypeScript**: Bugs (null/undefined errors, missing returns, async problems), security vulnerabilities (hardcoded secrets, XSS risks, injection vulnerabilities), code quality issues (console.logs, unused code, bad naming)

### Review Report Format

The extension provides detailed reports showing:

- Total files analyzed
- Files that were actually fixed
- For each fix: filename, line number, and exact description of what was changed
- Categorized by: Security Fixes, Bug Fixes, Code Quality Improvements

## Build & Package

To create a `.vsix` package for distribution:

```bash
# Install VS Code Extension Manager
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This will create a `.vsix` file that can be installed in VS Code or published to the VS Code Marketplace.

## Technical Details

- **Extension Name**: Strike Girl AI
- **Publisher**: UmaSahni
- **Commands**: `strikegirl.reviewCode`, `strikegirl.openChatbot`, `strikegirl.reviewCodeFromChatbot`, `strikegirl.buildWebsiteFromChatbot`
- **Configuration**: `strikegirl.apiKey`
- **AI Model**: Google Gemini 2.5 Flash
- **Supported Platforms**: Windows, macOS, Linux

## License

MIT

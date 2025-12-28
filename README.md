# Stike Extension

AI-powered code reviewer VS Code extension that automatically reviews and fixes code issues in HTML, CSS, JavaScript, and TypeScript files.

## Features

- 🔍 **Automatic Code Review** - Scans all code files in your workspace
- 🔧 **Auto-Fix Issues** - Automatically fixes security vulnerabilities, bugs, and code quality issues
- 📊 **Detailed Reports** - Provides comprehensive reports of all fixes
- 🛡️ **Security Scanning** - Detects hardcoded secrets, XSS risks, and injection vulnerabilities
- 🐛 **Bug Detection** - Finds null/undefined errors, missing returns, async problems
- ✨ **Code Quality** - Removes console.logs, unused code, and improves naming

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

You need to provide your Google GenAI API Key. You can do this in one of two ways:

### Option 1: VS Code Settings (Recommended)
1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Stike"
3. Enter your API key in the `Stike: Api Key` field

### Option 2: Environment Variable
Set the `GOOGLE_GENAI_API_KEY` environment variable:
```bash
# Windows (PowerShell)
$env:GOOGLE_GENAI_API_KEY="your-api-key-here"

# Windows (CMD)
set GOOGLE_GENAI_API_KEY=your-api-key-here

# Linux/Mac
export GOOGLE_GENAI_API_KEY=your-api-key-here
```

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
   - Open a workspace folder with code you want to review
   - Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
   - Type "Review and Fix Code" or "Stike"
   - Select **"Stike: Review and Fix Code"**
   - Choose which folder to review
   - Confirm when prompted

4. **View Results:**
   - Check the "Stike Code Reviewer" output channel for detailed logs
   - Files will be automatically fixed

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

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Review and Fix Code"
3. Select the folder you want to review
4. Confirm the review (this will modify files)
5. Check the output channel for progress and results

## Debugging

- **Set Breakpoints**: Click in the gutter next to line numbers in `src/extension.ts` or `src/codeReviewer.ts`
- **View Console**: Check the Debug Console in VS Code for console.log output
- **Check Output Channel**: View detailed logs in "Stike Code Reviewer" output channel
- **Reload Extension**: After making changes, stop debugging (`Shift+F5`) and press `F5` again

## What Gets Reviewed

The extension automatically scans and fixes:
- **HTML**: Missing doctype, semantic HTML, accessibility issues, missing alt attributes
- **CSS**: Syntax errors, browser compatibility, inefficient selectors, unused styles
- **JavaScript/TypeScript**: Bugs, security vulnerabilities, code quality issues

## Build & Package

To create a `.vsix` package for distribution:
```bash
# Install VS Code Extension Manager
npm install -g @vscode/vsce

# Package the extension
vsce package
```

## License

MIT


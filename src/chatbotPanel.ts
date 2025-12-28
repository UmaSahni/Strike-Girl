import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ChatbotPanel {
	public static currentPanel: ChatbotPanel | undefined;
	public static readonly viewType = 'stikeChatbot';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
	private _apiKey: string | null = null;

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (ChatbotPanel.currentPanel) {
			ChatbotPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			ChatbotPanel.viewType,
			'Stike Code Reviewer',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
			}
		);

		ChatbotPanel.currentPanel = new ChatbotPanel(panel, extensionUri);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		ChatbotPanel.currentPanel = new ChatbotPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'saveApiKey':
						await this._handleApiKey(message.apiKey);
						return;
					case 'startReview':
						if (message.folderPath) {
							await this._handleStartReview(message.folderPath);
						}
						return;
					case 'buildWebsite':
						if (message.projectDescription) {
							await this._handleBuildWebsite(message.projectDescription);
						}
						return;
					case 'sendMessage':
						await this._handleUserMessage(message.text);
						return;
					case 'applySuggestion':
						await this._handleApplySuggestion(message.suggestion);
						return;
					case 'ready':
						this._checkInitialState();
						return;
				}
			},
			null,
			this._disposables
		);
	}

	private _checkInitialState() {
		const config = vscode.workspace.getConfiguration('stike');
		let apiKey = config.get<string>('apiKey', '');
		
		if (!apiKey) {
			apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
		}

		if (apiKey) {
			this._apiKey = apiKey;
			this._sendMessage({ type: 'apiKeySet' });
			
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				if (workspaceFolders.length === 1) {
					this._sendMessage({ 
						type: 'message', 
						role: 'assistant', 
						content: 'Welcome back! Your API key is configured. I can help you:\n- Review code: Type "start review" or "review calculator" (for specific folder)\n- Build websites: Type "build website: [description]" or "create a calculator app"' 
					});
					this._sendMessage({ type: 'showStartButton', folderPath: workspaceFolders[0].uri.fsPath, folderName: workspaceFolders[0].name });
				} else {
					this._sendMessage({ 
						type: 'message', 
						role: 'assistant', 
						content: 'Welcome back! I found multiple workspace folders. Please select which folder you\'d like me to review.' 
					});
					this._sendMessage({ 
						type: 'showFolderSelection', 
						folders: workspaceFolders.map(f => ({ path: f.uri.fsPath, name: f.name }))
					});
				}
			} else {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'Welcome back! Please open a workspace folder to get started. I can help you review code or build websites.' 
				});
			}
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'Welcome to Stike Code Reviewer! I can help you:\n- Review and fix code\n- Build websites\n\nTo get started, please enter your Google GenAI API Key below.' 
			});
		}
	}

	private async _handleApiKey(apiKey: string) {
		if (!apiKey || apiKey.trim().length === 0) {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'API key cannot be empty. Please enter a valid API key.' 
			});
			return;
		}

		this._apiKey = apiKey;
		const config = vscode.workspace.getConfiguration('stike');
		await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
		
		this._sendMessage({ type: 'apiKeySet' });
		
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			if (workspaceFolders.length === 1) {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'API key saved successfully! I found your workspace folder. Would you like me to start reviewing your code?' 
				});
				this._sendMessage({ type: 'showStartButton', folderPath: workspaceFolders[0].uri.fsPath, folderName: workspaceFolders[0].name });
			} else {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'API key saved successfully! I found multiple workspace folders. Please select which folder you\'d like me to review.' 
				});
				this._sendMessage({ 
					type: 'showFolderSelection', 
					folders: workspaceFolders.map(f => ({ path: f.uri.fsPath, name: f.name }))
				});
			}
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'API key saved successfully! Please open a workspace folder to get started.' 
			});
		}
	}

	private async _findFolderInWorkspace(folderName: string, workspacePath: string): Promise<string | null> {
		try {
			function searchDirectory(dir: string, targetName: string): string | null {
				try {
					const items = fs.readdirSync(dir);
					for (const item of items) {
						const fullPath = path.join(dir, item);
						const stat = fs.statSync(fullPath);
						
						if (stat.isDirectory()) {
							// Check if folder name matches (case-insensitive)
							if (item.toLowerCase() === targetName.toLowerCase()) {
								return fullPath;
							}
							// Recursively search subdirectories
							const found = searchDirectory(fullPath, targetName);
							if (found) {
								return found;
							}
						}
					}
				} catch (error) {
					// Skip directories we can't read
				}
				return null;
			}
			
			return searchDirectory(workspacePath, folderName);
		} catch (error) {
			return null;
		}
	}

	private async _handleUserMessage(text: string) {
		if (!text || !text.trim()) return;

		const lowerText = text.toLowerCase();

		if (lowerText.includes('start review') || lowerText.includes('review code') || lowerText.includes('review')) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'Please open a workspace folder first to start reviewing code.' 
				});
				return;
			}

			// Check if user specified a folder name
			const reviewPatterns = [
				/review\s+(?:code\s+in\s+)?([a-zA-Z0-9_-]+)/i,
				/review\s+([a-zA-Z0-9_-]+)/i,
				/start\s+review\s+(?:in\s+)?([a-zA-Z0-9_-]+)/i
			];

			let targetFolder: string | null = null;
			for (const pattern of reviewPatterns) {
				const match = text.match(pattern);
				if (match && match[1]) {
					const folderName = match[1];
					const workspacePath = workspaceFolders[0].uri.fsPath;
					targetFolder = await this._findFolderInWorkspace(folderName, workspacePath);
					if (targetFolder) {
						break;
					}
				}
			}

			if (targetFolder) {
				// Found specific folder, review it
				await this._handleStartReview(targetFolder);
			} else if (workspaceFolders.length === 1) {
				// No specific folder mentioned, review entire workspace
				await this._handleStartReview(workspaceFolders[0].uri.fsPath);
			} else {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'Multiple workspace folders detected. Please select which folder to review.' 
				});
				this._sendMessage({ 
					type: 'showFolderSelection', 
					folders: workspaceFolders.map(f => ({ path: f.uri.fsPath, name: f.name }))
				});
			}
		} else if (
			lowerText.includes('build website') || 
			lowerText.includes('create website') || 
			lowerText.includes('make website') ||
			lowerText.includes('build a ') ||
			lowerText.includes('create a ') ||
			lowerText.includes('make a ') ||
			lowerText.includes(' create ') ||
			lowerText.includes(' build ') ||
			lowerText.includes(' make ')
		) {
			// Extract project description (remove trigger words but keep the description)
			let description = text;
			
			// Remove common trigger phrases
			description = description.replace(/^(build|create|make)\s+(website|a|an)?\s*:?\s*/i, '');
			description = description.replace(/^(build|create|make)\s+website\s*/i, '');
			description = description.trim();
			
			// If we still have a meaningful description, use it
			if (description && description.length > 3) {
				await this._handleBuildWebsite(description);
			} else {
				// If we don't have a description, try using the original text
				await this._handleBuildWebsite(text);
			}
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'I can help you:\n- Review code: Type "start review" or "review calculator" (to review a specific folder)\n- Build websites: Type "build website: [description]" or "create a calculator app"' 
			});
		}
	}

	private async _handleBuildWebsite(projectDescription: string) {
		if (!this._apiKey) {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'API key is required. Please enter your API key first.' 
			});
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'Please open a workspace folder first to build a website.' 
			});
			return;
		}

		try {
			vscode.commands.executeCommand('stike.buildWebsiteFromChatbot', projectDescription, this._apiKey);
		} catch (error: any) {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: `Error: ${error?.message || 'Failed to start website build'}` 
			});
		}
	}

	private async _handleStartReview(folderPath: string) {
		if (!this._apiKey) {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'API key is required. Please enter your API key first.' 
			});
			return;
		}

		this._sendMessage({ 
			type: 'message', 
			role: 'assistant', 
			content: 'Starting code review... This may take a few moments.' 
		});
		vscode.commands.executeCommand('stike.reviewCodeFromChatbot', folderPath, this._apiKey);
	}

	public sendMessage(content: string, role: 'user' | 'assistant' = 'assistant') {
		this._sendMessage({ type: 'message', role, content });
	}

	public sendSuggestion(suggestion: {
		type: 'refactor' | 'performance' | 'typo' | 'security' | 'bug';
		title: string;
		description: string;
		file: string;
		line?: number;
		diff?: { old: string; new: string };
	}) {
		this._sendMessage({ type: 'suggestion', suggestion });
	}

	public async sendCodeSuggestion(suggestion: {
		filePath: string;
		fileName: string;
		originalContent: string;
		suggestedContent: string;
		diff: { removed: string[]; added: string[] };
		relativePath: string;
	}) {
		await this._showDiffEditor(suggestion);
	}

	public sendProgress(message: string) {
		this._sendMessage({ type: 'progress', message });
	}

	public sendProgressComplete() {
		this._sendMessage({ type: 'progressComplete' });
	}

	public sendError(error: string) {
		this._sendMessage({ type: 'message', role: 'assistant', content: `Error: ${error}` });
	}

	private async _showDiffEditor(suggestion: {
		filePath: string;
		fileName: string;
		originalContent: string;
		suggestedContent: string;
		relativePath: string;
	}) {
		// Send suggestion directly to chatbot panel - no diff editor window
		this._sendMessage({
			type: 'codeSuggestion',
			suggestion: {
				...suggestion,
				title: `Code changes for ${suggestion.fileName}`,
				description: `Proposed changes to ${suggestion.relativePath}. Review the changes below and use Keep/Undo buttons.`,
				type: 'refactor'
			}
		});
	}

	private async _handleApplySuggestion(suggestion: any) {
		try {
			// Write the suggested content to the file
			fs.writeFileSync(suggestion.filePath, suggestion.suggestedContent, 'utf-8');
			
			// Send confirmation message
			this._sendMessage({
				type: 'message',
				role: 'assistant',
				content: `✅ Applied changes to ${suggestion.relativePath || suggestion.fileName}`
			});
			
			// Optionally open the file in editor
			const doc = await vscode.workspace.openTextDocument(suggestion.filePath);
			await vscode.window.showTextDocument(doc);
			
		} catch (error: any) {
			this._sendMessage({
				type: 'message',
				role: 'assistant',
				content: `❌ Error applying changes: ${error.message}`
			});
			vscode.window.showErrorMessage(`Failed to apply changes: ${error.message}`);
		}
	}

	private _sendMessage(message: any) {
		if (this._panel && this._panel.webview) {
			this._panel.webview.postMessage(message);
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Stike Code Reviewer</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			height: 100vh;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.header {
			padding: 16px 20px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.header-title {
			font-size: 16px;
			font-weight: 600;
		}

		.chat-container {
			flex: 1;
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}

		.messages {
			flex: 1;
			overflow-y: auto;
			padding: 20px;
			display: flex;
			flex-direction: column;
			gap: 20px;
		}

		.message {
			display: flex;
			gap: 12px;
			max-width: 85%;
			animation: fadeIn 0.3s ease-in;
		}

		.message.user {
			align-self: flex-end;
			flex-direction: row-reverse;
		}

		.message-avatar {
			width: 32px;
			height: 32px;
			border-radius: 50%;
			flex-shrink: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 18px;
		}

		.message-avatar.hidden {
			display: none;
		}

		.message.user .message-avatar {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.message.assistant .message-avatar {
			background: var(--vscode-textLink-foreground);
			color: white;
		}

		.message-content {
			flex: 1;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 12px 16px;
			line-height: 1.5;
		}

		.message.user .message-content {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-background);
		}

		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(10px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.suggestion-card {
			background: var(--vscode-sideBar-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 16px;
			margin-top: 12px;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.suggestion-header {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.suggestion-icon {
			width: 32px;
			height: 32px;
			border-radius: 6px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 18px;
			flex-shrink: 0;
		}

		.suggestion-icon.refactor {
			background: #10b981;
			color: white;
		}

		.suggestion-icon.performance {
			background: #f59e0b;
			color: white;
		}

		.suggestion-icon.typo {
			background: #3b82f6;
			color: white;
		}

		.suggestion-icon.security {
			background: #ef4444;
			color: white;
		}

		.suggestion-icon.bug {
			background: #8b5cf6;
			color: white;
		}

		.suggestion-title {
			font-weight: 600;
			font-size: 14px;
			flex: 1;
		}

		.suggestion-description {
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.5;
		}

		.diff-container {
			background: var(--vscode-textCodeBlock-background);
			border-radius: 6px;
			padding: 0;
			font-family: 'Courier New', monospace;
			font-size: 12px;
			overflow-x: auto;
			margin: 8px 0;
			max-height: 400px;
			overflow-y: auto;
			border: 1px solid var(--vscode-panel-border);
		}

		.diff-pair {
			position: relative;
			margin: 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.diff-pair:last-child {
			border-bottom: none;
		}

		.diff-line-wrapper {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 12px;
			position: relative;
		}

		.diff-line-wrapper:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.diff-line-wrapper:hover .diff-line-actions {
			opacity: 1;
		}

		.diff-line-actions {
			display: flex;
			gap: 6px;
			margin-left: auto;
			opacity: 0;
			transition: opacity 0.2s;
		}

		.diff-line-wrapper:hover .diff-line-actions {
			opacity: 1;
		}

		.diff-line {
			flex: 1;
			padding: 2px 0;
			font-family: 'Courier New', monospace;
			white-space: pre;
			line-height: 1.6;
			word-break: break-word;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.diff-line-num {
			min-width: 24px;
			text-align: right;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			user-select: none;
		}

		.diff-line-content {
			flex: 1;
		}

		.diff-line.removed {
			background: rgba(244, 67, 54, 0.1);
		}

		.diff-line-wrapper.removed {
			background: rgba(244, 67, 54, 0.05);
		}

		.diff-line-wrapper.removed .diff-line-content {
			color: #f44336;
			text-decoration: line-through;
		}

		.diff-line.added {
			background: rgba(76, 175, 80, 0.1);
		}

		.diff-line-wrapper.added {
			background: rgba(76, 175, 80, 0.05);
		}

		.diff-line-wrapper.added .diff-line-content {
			color: #4caf50;
		}

		.diff-line-btn {
			padding: 3px 10px;
			border: 1px solid var(--vscode-button-border);
			border-radius: 3px;
			cursor: pointer;
			font-size: 11px;
			font-weight: 500;
			transition: all 0.15s;
			white-space: nowrap;
			flex-shrink: 0;
			font-family: var(--vscode-font-family);
		}

		.diff-line-btn.keep {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-background);
		}

		.diff-line-btn.keep:hover {
			opacity: 0.9;
			transform: translateY(-1px);
		}

		.diff-line-btn.undo {
			background: transparent;
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
		}

		.diff-line-btn.undo:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.diff-line-btn:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}

		.diff-actions-bar {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			padding: 8px 12px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
			border-radius: 0 0 6px 6px;
		}

		.diff-action-btn {
			padding: 4px 12px;
			border: 1px solid var(--vscode-button-border);
			border-radius: 3px;
			cursor: pointer;
			font-size: 11px;
			font-weight: 500;
			transition: all 0.15s;
			font-family: var(--vscode-font-family);
		}

		.diff-action-btn.undo-all {
			background: transparent;
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
		}

		.diff-action-btn.undo-all:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.diff-action-btn.keep-all {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-background);
		}

		.diff-action-btn.keep-all:hover {
			opacity: 0.9;
		}

		.suggestion-actions {
			display: flex;
			gap: 8px;
			margin-top: 4px;
		}

		.suggestion-btn {
			padding: 6px 16px;
			border: 1px solid var(--vscode-button-border);
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			font-weight: 500;
			transition: all 0.2s;
		}

		.suggestion-btn.apply {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-background);
		}

		.suggestion-btn.apply:hover {
			opacity: 0.8;
		}

		.suggestion-btn.dismiss {
			background: transparent;
			color: var(--vscode-foreground);
			border-color: var(--vscode-panel-border);
		}

		.suggestion-btn.dismiss:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.input-container {
			padding: 16px 20px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
			transition: background 0.2s ease;
		}

		.input-wrapper {
			display: flex;
			gap: 10px;
			align-items: center;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 8px;
			padding: 18px 20px;
		}

		.input-wrapper:focus-within {
			border: 1px solid var(--vscode-input-border);
			box-shadow: none;
			outline: none;
		}

		.chat-input {
			flex: 1;
			background: transparent;
			border: none;
			color: var(--vscode-input-foreground);
			font-size: 14px;
			font-family: var(--vscode-font-family);
			outline: none;
			line-height: 1.5;
			padding: 0;
			box-shadow: none;
		}

		.chat-input:focus {
			outline: none;
			border: none;
			box-shadow: none;
		}

		.chat-input::placeholder {
			color: var(--vscode-input-placeholderForeground);
			opacity: 0.6;
		}

		.send-button {
			cursor: pointer;
			padding: 8px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: 1px solid var(--vscode-button-border);
			border-radius: 6px;
			font-size: 13px;
			font-weight: 500;
			font-family: var(--vscode-font-family);
			transition: all 0.2s ease;
			flex-shrink: 0;
			white-space: nowrap;
		}

		.send-button:hover {
			opacity: 0.9;
		}

		.send-button:active {
			opacity: 0.8;
		}

		.send-button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.api-key-container {
			padding: 16px 20px;
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-input-background);
		}

		.api-key-input-wrapper {
			display: flex;
			gap: 8px;
		}

		.api-key-input {
			flex: 1;
			padding: 10px 14px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			font-size: 14px;
			font-family: var(--vscode-font-family);
		}

		.api-key-input:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
		}

		.save-btn {
			padding: 10px 20px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
		}

		.save-btn:hover {
			opacity: 0.8;
		}

		.hidden {
			display: none;
		}

		.action-buttons {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 12px;
		}

		.action-button {
			padding: 8px 16px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: 1px solid var(--vscode-button-border);
			border-radius: 6px;
			cursor: pointer;
			font-size: 13px;
			transition: all 0.2s;
		}

		.action-button:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.action-button.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-color: var(--vscode-button-background);
		}

		.action-button.primary:hover {
			opacity: 0.8;
		}

		.progress-indicator {
			display: none;
			padding: 8px 12px;
			background: var(--vscode-textBlockQuote-background);
			border-left: 3px solid var(--vscode-progressBar-background);
			border-radius: 6px;
			margin: 8px 0;
			font-size: 13px;
		}

		.progress-indicator.active {
			display: block;
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="header-title">Stike Code Reviewer</div>
	</div>

	<div class="chat-container">
		<div class="messages" id="messages"></div>
		
		<div class="progress-indicator" id="progressIndicator">
			<span id="progressText">Processing...</span>
		</div>

		<div class="api-key-container" id="apiKeyContainer">
			<div class="api-key-input-wrapper">
				<input 
					type="password" 
					class="api-key-input" 
					id="apiKeyInput" 
					placeholder="Enter your Google GenAI API Key"
					autocomplete="off"
				/>
				<button class="save-btn" id="saveApiKeyBtn">Save</button>
			</div>
		</div>

		<div class="input-container" id="chatInputContainer" style="display: none;">
			<div class="input-wrapper">
				<input 
					type="text" 
					class="chat-input" 
					id="chatInput" 
					placeholder="Generate a question or provide Suggestions..."
					autocomplete="off"
				/>
				<button class="send-button" id="sendBtn">Send</button>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const messagesContainer = document.getElementById('messages');
		const apiKeyInput = document.getElementById('apiKeyInput');
		const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
		const apiKeyContainer = document.getElementById('apiKeyContainer');
		const chatInputContainer = document.getElementById('chatInputContainer');
		const chatInput = document.getElementById('chatInput');
		const sendBtn = document.getElementById('sendBtn');
		const progressIndicator = document.getElementById('progressIndicator');
		const progressText = document.getElementById('progressText');

		let apiKeySet = false;
		let lastMessageRole = null;
		let messages = [];

		// Restore messages from state
		const state = vscode.getState();
		if (state && state.messages) {
			messages = state.messages;
			messages.forEach(msg => {
				if (msg.type === 'message') {
					addMessageToUI(msg.content, msg.role);
				} else if (msg.type === 'suggestion') {
					addSuggestionToUI(msg.suggestion);
				}
			});
			if (messages.length > 0) {
				const lastMsg = messages[messages.length - 1];
				lastMessageRole = lastMsg.role || (lastMsg.type === 'suggestion' ? 'assistant' : null);
			}
		}

		function saveState() {
			vscode.setState({ messages: messages });
		}

		function addMessage(content, role) {
			// Save to messages array
			messages.push({ type: 'message', content: content, role: role });
			saveState();
			addMessageToUI(content, role);
		}

		function addMessageToUI(content, role) {
			const messageDiv = document.createElement('div');
			messageDiv.className = \`message \${role}\`;
			
			const avatar = document.createElement('div');
			avatar.className = 'message-avatar';
			avatar.textContent = role === 'user' ? '👤' : '🤖';
			
			// Only show avatar if role changed from last message
			if (lastMessageRole === role) {
				avatar.classList.add('hidden');
			}
			
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			contentDiv.textContent = content;
			
			messageDiv.appendChild(avatar);
			messageDiv.appendChild(contentDiv);
			messagesContainer.appendChild(messageDiv);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
			
			lastMessageRole = role;
		}

		function addSuggestion(suggestion) {
			// Save to messages array
			messages.push({ type: 'suggestion', suggestion: suggestion });
			saveState();
			addSuggestionToUI(suggestion);
		}

		function addSuggestionToUI(suggestion) {
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message assistant';
			
			const avatar = document.createElement('div');
			avatar.className = 'message-avatar';
			avatar.textContent = '🤖';
			
			// Only show avatar if role changed from last message
			if (lastMessageRole === 'assistant') {
				avatar.classList.add('hidden');
			}
			
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			
			const card = document.createElement('div');
			card.className = 'suggestion-card';
			
			const header = document.createElement('div');
			header.className = 'suggestion-header';
			
			const icon = document.createElement('div');
			icon.className = \`suggestion-icon \${suggestion.type}\`;
			const iconMap = {
				refactor: '🔄',
				performance: '⚡',
				typo: 'ABC',
				security: '🔒',
				bug: '🐛'
			};
			icon.textContent = iconMap[suggestion.type] || '💡';
			
			const title = document.createElement('div');
			title.className = 'suggestion-title';
			title.textContent = suggestion.title;
			
			header.appendChild(icon);
			header.appendChild(title);
			card.appendChild(header);
			
			if (suggestion.description) {
				const desc = document.createElement('div');
				desc.className = 'suggestion-description';
				desc.textContent = suggestion.description;
				card.appendChild(desc);
			}
			
			if (suggestion.diff) {
				const diffContainer = document.createElement('div');
				diffContainer.className = 'diff-container';
				
				let totalChanges = 0;
				
				// Handle new format: diff.removed and diff.added arrays - show as pairs with buttons
				if (suggestion.diff.removed && Array.isArray(suggestion.diff.removed) && 
					suggestion.diff.added && Array.isArray(suggestion.diff.added)) {
					
					const maxLength = Math.max(suggestion.diff.removed.length, suggestion.diff.added.length);
					totalChanges = maxLength;
					
					for (let i = 0; i < maxLength; i++) {
						const pair = document.createElement('div');
						pair.className = 'diff-pair';
						
						// Removed line (if exists)
						if (i < suggestion.diff.removed.length) {
							const removedWrapper = document.createElement('div');
							removedWrapper.className = 'diff-line-wrapper removed';
							
							const removedLine = document.createElement('div');
							removedLine.className = 'diff-line removed';
							
							const lineNum = document.createElement('span');
							lineNum.className = 'diff-line-num';
							lineNum.textContent = (i + 1).toString();
							
							const lineContent = document.createElement('span');
							lineContent.className = 'diff-line-content';
							lineContent.textContent = suggestion.diff.removed[i];
							
							removedLine.appendChild(lineNum);
							removedLine.appendChild(lineContent);
							
							const actions = document.createElement('div');
							actions.className = 'diff-line-actions';
							
							const keepBtn = document.createElement('button');
							keepBtn.className = 'diff-line-btn keep';
							keepBtn.textContent = 'Keep';
							keepBtn.onclick = () => {
								vscode.postMessage({ 
									command: 'applySuggestion', 
									suggestion: suggestion 
								});
								diffContainer.querySelectorAll('.diff-line-btn').forEach(btn => {
									btn.disabled = true;
									if (btn.classList.contains('keep')) {
										btn.textContent = 'Kept ✓';
									}
								});
							};
							
							const undoBtn = document.createElement('button');
							undoBtn.className = 'diff-line-btn undo';
							undoBtn.textContent = 'Undo';
							undoBtn.onclick = () => {
								pair.style.display = 'none';
							};
							
							actions.appendChild(keepBtn);
							actions.appendChild(undoBtn);
							
							removedWrapper.appendChild(removedLine);
							removedWrapper.appendChild(actions);
							pair.appendChild(removedWrapper);
						}
						
						// Added line (if exists)
						if (i < suggestion.diff.added.length) {
							const addedWrapper = document.createElement('div');
							addedWrapper.className = 'diff-line-wrapper added';
							
							const addedLine = document.createElement('div');
							addedLine.className = 'diff-line added';
							
							const lineNum = document.createElement('span');
							lineNum.className = 'diff-line-num';
							lineNum.textContent = (i + 1).toString();
							
							const lineContent = document.createElement('span');
							lineContent.className = 'diff-line-content';
							lineContent.textContent = suggestion.diff.added[i];
							
							addedLine.appendChild(lineNum);
							addedLine.appendChild(lineContent);
							
							// Only add buttons if we haven't already added them for removed line
							if (i >= suggestion.diff.removed.length) {
								const actions = document.createElement('div');
								actions.className = 'diff-line-actions';
								
								const keepBtn = document.createElement('button');
								keepBtn.className = 'diff-line-btn keep';
								keepBtn.textContent = 'Keep';
								keepBtn.onclick = () => {
									vscode.postMessage({ 
										command: 'applySuggestion', 
										suggestion: suggestion 
									});
									diffContainer.querySelectorAll('.diff-line-btn').forEach(btn => {
										btn.disabled = true;
										if (btn.classList.contains('keep')) {
											btn.textContent = 'Kept ✓';
										}
									});
								};
								
								const undoBtn = document.createElement('button');
								undoBtn.className = 'diff-line-btn undo';
								undoBtn.textContent = 'Undo';
								undoBtn.onclick = () => {
									pair.style.display = 'none';
								};
								
								actions.appendChild(keepBtn);
								actions.appendChild(undoBtn);
								
								addedWrapper.appendChild(addedLine);
								addedWrapper.appendChild(actions);
							} else {
								addedWrapper.appendChild(addedLine);
							}
							
							pair.appendChild(addedWrapper);
						}
						
						diffContainer.appendChild(pair);
					}
				} else {
					// Handle old format: diff.old and diff.new (for backward compatibility)
					if (suggestion.diff.old && !suggestion.diff.removed) {
						const oldWrapper = document.createElement('div');
						oldWrapper.className = 'diff-line-wrapper removed';
						
						const oldLine = document.createElement('div');
						oldLine.className = 'diff-line removed';
						oldLine.textContent = suggestion.diff.old;
						oldWrapper.appendChild(oldLine);
						diffContainer.appendChild(oldWrapper);
						totalChanges = 1;
					}
					
					if (suggestion.diff.new && !suggestion.diff.added) {
						const newWrapper = document.createElement('div');
						newWrapper.className = 'diff-line-wrapper added';
						
						const newLine = document.createElement('div');
						newLine.className = 'diff-line added';
						newLine.textContent = suggestion.diff.new;
						newWrapper.appendChild(newLine);
						diffContainer.appendChild(newWrapper);
						if (totalChanges === 0) totalChanges = 1;
					}
				}
				
				// Add action bar with "Keep All" and "Undo All" buttons
				if (totalChanges > 0) {
					const actionsBar = document.createElement('div');
					actionsBar.className = 'diff-actions-bar';
					
					const undoAllBtn = document.createElement('button');
					undoAllBtn.className = 'diff-action-btn undo-all';
					undoAllBtn.textContent = 'Undo All';
					undoAllBtn.onclick = () => {
						card.style.display = 'none';
					};
					
					const keepAllBtn = document.createElement('button');
					keepAllBtn.className = 'diff-action-btn keep-all';
					keepAllBtn.textContent = 'Keep All';
					keepAllBtn.onclick = () => {
						vscode.postMessage({ 
							command: 'applySuggestion', 
							suggestion: suggestion 
						});
						diffContainer.querySelectorAll('.diff-line-btn').forEach(btn => {
							btn.disabled = true;
							if (btn.classList.contains('keep')) {
								btn.textContent = 'Kept ✓';
							}
						});
						keepAllBtn.disabled = true;
						keepAllBtn.textContent = 'All Kept ✓';
					};
					
					actionsBar.appendChild(undoAllBtn);
					actionsBar.appendChild(keepAllBtn);
					diffContainer.appendChild(actionsBar);
				}
				
				card.appendChild(diffContainer);
			}
			// Action buttons are now inline with each diff line, and "Keep All"/"Undo All" are in the diff container
			
			contentDiv.appendChild(card);
			messageDiv.appendChild(avatar);
			messageDiv.appendChild(contentDiv);
			messagesContainer.appendChild(messageDiv);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
			
			lastMessageRole = 'assistant';
		}

		function addFolderSelection(folders) {
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message assistant';
			
			const avatar = document.createElement('div');
			avatar.className = 'message-avatar';
			avatar.textContent = '🤖';
			
			// Only show avatar if role changed from last message
			if (lastMessageRole === 'assistant') {
				avatar.classList.add('hidden');
			}
			
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			
			const buttonsDiv = document.createElement('div');
			buttonsDiv.className = 'action-buttons';
			
			folders.forEach(folder => {
				const button = document.createElement('button');
				button.className = 'action-button';
				button.textContent = \`📁 \${folder.name}\`;
				button.onclick = () => {
					vscode.postMessage({
						command: 'startReview',
						folderPath: folder.path
					});
					addMessage(\`Selected folder: \${folder.name}\`, 'user');
				};
				buttonsDiv.appendChild(button);
			});
			
			contentDiv.appendChild(buttonsDiv);
			messageDiv.appendChild(avatar);
			messageDiv.appendChild(contentDiv);
			messagesContainer.appendChild(messageDiv);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
			
			lastMessageRole = 'assistant';
		}

		function addStartButton(folderPath, folderName) {
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message assistant';
			
			const avatar = document.createElement('div');
			avatar.className = 'message-avatar';
			avatar.textContent = '🤖';
			
			// Only show avatar if role changed from last message
			if (lastMessageRole === 'assistant') {
				avatar.classList.add('hidden');
			}
			
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			
			const buttonDiv = document.createElement('div');
			buttonDiv.className = 'action-buttons';
			
			const button = document.createElement('button');
			button.className = 'action-button primary';
			button.textContent = \`🚀 Start Code Review (\${folderName})\`;
			button.onclick = () => {
				vscode.postMessage({
					command: 'startReview',
					folderPath: folderPath
				});
				addMessage('Starting code review...', 'user');
			};
			
			buttonDiv.appendChild(button);
			contentDiv.appendChild(buttonDiv);
			messageDiv.appendChild(avatar);
			messageDiv.appendChild(contentDiv);
			messagesContainer.appendChild(messageDiv);
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
			
			lastMessageRole = 'assistant';
		}

		function saveApiKey() {
			const apiKey = apiKeyInput.value.trim();
			if (apiKey) {
				vscode.postMessage({
					command: 'saveApiKey',
					apiKey: apiKey
				});
				apiKeyInput.value = '';
			}
		}

		function sendMessage() {
			const text = chatInput.value.trim();
			if (text) {
				addMessage(text, 'user');
				vscode.postMessage({
					command: 'sendMessage',
					text: text
				});
				chatInput.value = '';
			}
		}

		saveApiKeyBtn.addEventListener('click', saveApiKey);
		apiKeyInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				saveApiKey();
			}
		});

		sendBtn.addEventListener('click', sendMessage);
		chatInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				sendMessage();
			}
		});

		window.addEventListener('message', event => {
			const message = event.data;

			switch (message.type) {
				case 'message':
					addMessage(message.content, message.role);
					break;
				
				case 'suggestion':
					addSuggestion(message.suggestion);
					break;
				
				case 'codeSuggestion':
					// Handle code suggestions with file changes
					addSuggestion(message.suggestion);
					break;
				
				case 'apiKeySet':
					apiKeySet = true;
					apiKeyContainer.style.display = 'none';
					chatInputContainer.style.display = 'block';
					break;
				
				case 'showFolderSelection':
					addFolderSelection(message.folders);
					break;
				
				case 'showStartButton':
					addStartButton(message.folderPath, message.folderName);
					break;
				
				case 'progress':
					progressText.textContent = message.message;
					progressIndicator.classList.add('active');
					break;
				
				case 'progressComplete':
					progressIndicator.classList.remove('active');
					break;
			}
		});

		vscode.postMessage({ command: 'ready' });
	</script>
</body>
</html>`;
	}

	public dispose() {
		ChatbotPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}

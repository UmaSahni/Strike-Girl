import * as vscode from 'vscode';
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
					case 'sendMessage':
						await this._handleUserMessage(message.text);
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
						content: 'Welcome back! Your API key is configured. I found your workspace folder. Would you like me to start reviewing your code?' 
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
					content: 'Welcome back! Please open a workspace folder to get started with code review.' 
				});
			}
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'Welcome to Stike Code Reviewer! To get started, please enter your Google GenAI API Key below.' 
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

	private async _handleUserMessage(text: string) {
		if (!text || !text.trim()) return;

		if (text.toLowerCase().includes('start review') || text.toLowerCase().includes('review code')) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				this._sendMessage({ 
					type: 'message', 
					role: 'assistant', 
					content: 'Please open a workspace folder first to start reviewing code.' 
				});
				return;
			}

			if (workspaceFolders.length === 1) {
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
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'I can help you review and fix your code. Type "start review" to begin, or select a folder using the buttons above.' 
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

		const folderName = path.basename(folderPath);
		const confirm = await vscode.window.showWarningMessage(
			`Review and fix code in "${folderName}"? This will modify files.`,
			'Yes, Start Review',
			'Cancel'
		);

		if (confirm === 'Yes, Start Review') {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'Starting code review... This may take a few moments.' 
			});
			vscode.commands.executeCommand('stike.reviewCodeFromChatbot', folderPath, this._apiKey);
		} else {
			this._sendMessage({ 
				type: 'message', 
				role: 'assistant', 
				content: 'Code review cancelled.' 
			});
		}
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

	public sendProgress(message: string) {
		this._sendMessage({ type: 'progress', message });
	}

	public sendProgressComplete() {
		this._sendMessage({ type: 'progressComplete' });
	}

	public sendError(error: string) {
		this._sendMessage({ type: 'message', role: 'assistant', content: `Error: ${error}` });
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
			padding: 12px;
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
			overflow-x: auto;
		}

		.diff-line {
			padding: 2px 0;
			font-family: 'Courier New', monospace;
		}

		.diff-line.removed {
			background: rgba(244, 67, 54, 0.1);
			color: #f44336;
		}

		.diff-line.removed::before {
			content: '- ';
			color: #f44336;
			font-weight: bold;
		}

		.diff-line.added {
			background: rgba(76, 175, 80, 0.1);
			color: #4caf50;
		}

		.diff-line.added::before {
			content: '+ ';
			color: #4caf50;
			font-weight: bold;
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

		function addMessage(content, role) {
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
				
				if (suggestion.diff.old) {
					const oldLine = document.createElement('div');
					oldLine.className = 'diff-line removed';
					oldLine.textContent = suggestion.diff.old;
					diffContainer.appendChild(oldLine);
				}
				
				if (suggestion.diff.new) {
					const newLine = document.createElement('div');
					newLine.className = 'diff-line added';
					newLine.textContent = suggestion.diff.new;
					diffContainer.appendChild(newLine);
				}
				
				card.appendChild(diffContainer);
			}
			
			const actions = document.createElement('div');
			actions.className = 'suggestion-actions';
			
			const applyBtn = document.createElement('button');
			applyBtn.className = 'suggestion-btn apply';
			applyBtn.textContent = 'Apply Suggestion';
			applyBtn.onclick = () => {
				vscode.postMessage({ command: 'applySuggestion', suggestion });
			};
			
			const dismissBtn = document.createElement('button');
			dismissBtn.className = 'suggestion-btn dismiss';
			dismissBtn.textContent = 'Dismiss';
			dismissBtn.onclick = () => {
				card.style.display = 'none';
			};
			
			actions.appendChild(applyBtn);
			actions.appendChild(dismissBtn);
			card.appendChild(actions);
			
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

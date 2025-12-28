import * as vscode from 'vscode';
import * as path from 'path';
import { CodeReviewer } from './codeReviewer';
import { ChatbotPanel } from './chatbotPanel';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	console.log('Stike Code Reviewer extension is now active!');

	// Create output channel
	outputChannel = vscode.window.createOutputChannel('Stike Code Reviewer');

	// Open chatbot panel automatically when extension activates
	ChatbotPanel.createOrShow(context.extensionUri);

	// Register command to open chatbot panel
	const openChatbotDisposable = vscode.commands.registerCommand('stike.openChatbot', () => {
		ChatbotPanel.createOrShow(context.extensionUri);
	});

	// Register command to review code from chatbot
	const reviewCodeDisposable = vscode.commands.registerCommand('stike.reviewCodeFromChatbot', async (folderPath: string, apiKey: string) => {
		const chatbotPanel = ChatbotPanel.currentPanel;
		
		if (!chatbotPanel) {
			vscode.window.showErrorMessage('Chatbot panel is not open.');
			return;
		}

		try {
			const reviewer = new CodeReviewer(apiKey, outputChannel, chatbotPanel);
			await reviewer.reviewCode(folderPath);
		} catch (error: any) {
			const errorMsg = error?.message || 'Unknown error occurred';
			chatbotPanel.sendError(errorMsg);
			vscode.window.showErrorMessage(`Code review failed: ${errorMsg}`);
		}
	});

	// Register command to start review (legacy command, now triggers chatbot)
	const reviewCodeLegacyDisposable = vscode.commands.registerCommand('stike.reviewCode', async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
			return;
		}

		ChatbotPanel.createOrShow(context.extensionUri);
		const chatbotPanel = ChatbotPanel.currentPanel;
		
		if (chatbotPanel) {
			chatbotPanel.sendMessage('Please enter your API key above and then let me know when you\'re ready to start reviewing code!', 'assistant');
		}
	});

	context.subscriptions.push(
		openChatbotDisposable, 
		reviewCodeDisposable, 
		reviewCodeLegacyDisposable, 
		outputChannel
	);
}

export function deactivate() {
	if (outputChannel) {
		outputChannel.dispose();
	}
}


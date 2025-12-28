import * as vscode from 'vscode';
import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { ChatbotPanel } from './chatbotPanel';

const asyncExecute = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);

export class WebsiteBuilder {
	private ai: GoogleGenAI;
	private outputChannel: vscode.OutputChannel;
	private chatbotPanel?: ChatbotPanel;
	private baseDirectory: string = '';

	constructor(apiKey: string, outputChannel: vscode.OutputChannel, chatbotPanel?: ChatbotPanel) {
		this.ai = new GoogleGenAI({ apiKey });
		this.outputChannel = outputChannel;
		this.chatbotPanel = chatbotPanel;
	}

	private getRelativePath(filePath: string): string {
		if (!this.baseDirectory) {
			return filePath;
		}
		try {
			const relative = path.relative(this.baseDirectory, filePath);
			return relative || path.basename(filePath);
		} catch {
			return filePath;
		}
	}

	async executeCommand(args: { command?: string; content?: string; filePath?: string }): Promise<{ success: boolean; message: string }> {
		try {
			if (args.content && args.filePath) {
				// Create full path relative to base directory
				const fullPath = path.isAbsolute(args.filePath) 
					? args.filePath 
					: path.join(this.baseDirectory, args.filePath);
				
				// Ensure directory exists
				const dir = path.dirname(fullPath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				await writeFileAsync(fullPath, args.content, 'utf-8');
				const relativePath = this.getRelativePath(fullPath);
				const message = `📝 Created: ${relativePath}`;
				this.outputChannel.appendLine(message);
				if (this.chatbotPanel) {
					this.chatbotPanel.sendMessage(message, 'assistant');
				}
				return { success: true, message: `Success: File created at ${relativePath}` };
			} else if (args.command) {
				// Execute command in the base directory
				const { stdout, stderr } = await asyncExecute(args.command, {
					cwd: this.baseDirectory
				});
				
				if (stderr && !stderr.includes('already exists')) {
					const message = `⚠️ ${stderr}`;
					this.outputChannel.appendLine(message);
					if (this.chatbotPanel) {
						this.chatbotPanel.sendMessage(message, 'assistant');
					}
					return { success: false, message: `Error: ${stderr}` };
				}
				
				const message = `✅ Executed: ${args.command}`;
				this.outputChannel.appendLine(message);
				if (this.chatbotPanel) {
					this.chatbotPanel.sendMessage(message, 'assistant');
				}
				return { success: true, message: `Success: ${stdout || 'Command executed successfully'}` };
			}
			return { success: false, message: 'Error: No command or content provided' };
		} catch (error: any) {
			const errorMsg = `Error: ${error?.message || 'Unknown error'}`;
			this.outputChannel.appendLine(errorMsg);
			if (this.chatbotPanel) {
				this.chatbotPanel.sendError(errorMsg);
			}
			return { success: false, message: errorMsg };
		}
	}

	private getTools() {
		return {
			'executeCommand': (args: { command?: string; content?: string; filePath?: string }) => this.executeCommand(args)
		};
	}

	async buildWebsite(projectDescription: string, workspacePath: string): Promise<void> {
		this.baseDirectory = workspacePath;
		this.outputChannel.appendLine(`🚀 Building website: ${projectDescription}\n`);
		this.outputChannel.show();

		if (this.chatbotPanel) {
			this.chatbotPanel.sendMessage(`🚀 Starting website build: ${projectDescription}`, 'assistant');
			this.chatbotPanel.sendProgress(`🚀 Building website...`);
		}

		const History: any[] = [{
			role: 'user',
			parts: [{ text: projectDescription }]
		}];

		const tools = this.getTools();

		while (true) {
			try {
				const result = await this.ai.models.generateContent({
					model: 'gemini-2.5-flash',
					contents: History,
					config: {
						systemInstruction: `You are an expert Website builder. Follow these steps:
					
1. FIRST create the project folder: mkdir project-name
2. THEN create files with COMPLETE TEMPLATES:
   - index.html (with basic HTML5 structure)
   - style.css (with basic styles)
   - script.js (with basic functionality)

IMPORTANT:
- Use the 'content' parameter to send COMPLETE file content
- Always include the 'filePath' parameter when writing files
- For folders, use the 'command' parameter with mkdir
- Include proper DOCTYPE, meta tags, and semantic HTML
- Include responsive CSS (viewport meta, flexible units)
- Include DOMContentLoaded event in JavaScript

EXAMPLE for a calculator:
1. {command: "mkdir calculator"}
2. {content: "<!DOCTYPE html>...", filePath: "calculator/index.html"}
3. {content: "body { font-family: Arial...}", filePath: "calculator/style.css"}
4. {content: "document.addEventListener...", filePath: "calculator/script.js"}`,
						tools: [{
							functionDeclarations: [
								{
									name: 'executeCommand',
									description: 'Execute commands or create files with content',
									parameters: {
										type: Type.OBJECT,
										properties: {
											command: {
												type: Type.STRING,
												description: 'A terminal command (e.g., "mkdir my-project")'
											},
											content: {
												type: Type.STRING,
												description: 'Complete file content to write (for HTML/CSS/JS files)'
											},
											filePath: {
												type: Type.STRING,
												description: 'Path where file should be created (e.g., "my-project/index.html")'
											}
										},
										required: []
									}
								}
							]
						}]
					}
				});

				// Process function calls
				if (result.functionCalls && result.functionCalls.length > 0) {
					for (const functionCall of result.functionCalls) {
						const name = functionCall.name;
						const args = functionCall.args || {};

						if (!name || !(name in tools)) {
							this.outputChannel.appendLine(`⚠️ Unknown function: ${name}`);
							continue;
						}

						if (this.chatbotPanel) {
							if (args.content && args.filePath) {
								this.chatbotPanel.sendMessage(`📝 Creating file: ${args.filePath}`, 'assistant');
							} else if (args.command) {
								this.chatbotPanel.sendMessage(`⚙️ Executing: ${args.command}`, 'assistant');
							}
						}

						const toolResponse = await (tools as any)[name](args);

						// Add function call to history
						History.push({
							role: 'model',
							parts: [{ functionCall }]
						});

						// Add function response to history
						History.push({
							role: 'user',
							parts: [{
								functionResponse: {
									name,
									response: { result: toolResponse }
								}
							}]
						});
					}
				} else {
					const summary = result.text || '';
					this.outputChannel.appendLine('\n' + summary);
					if (this.chatbotPanel) {
						this.chatbotPanel.sendProgressComplete();
						this.chatbotPanel.sendMessage(`✅ Website build complete!\n\n${summary}`, 'assistant');
					}
					vscode.window.showInformationMessage('Website build complete! Check the chatbot for details.');
					break;
				}
			} catch (error: any) {
				const errorMsg = error?.message || 'Unknown error occurred';
				this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
				if (this.chatbotPanel) {
					this.chatbotPanel.sendError(errorMsg);
					this.chatbotPanel.sendProgressComplete();
				}
				vscode.window.showErrorMessage(`Website build failed: ${errorMsg}`);
				break;
			}
		}
	}
}


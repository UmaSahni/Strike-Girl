import * as vscode from 'vscode';
import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ChatbotPanel } from './chatbotPanel';

export class CodeReviewer {
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

	async listFiles(directory: string): Promise<{ files: string[] }> {
		const files: string[] = [];
		const extensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css'];

		function scan(dir: string) {
			try {
				const items = fs.readdirSync(dir);

				for (const item of items) {
					const fullPath = path.join(dir, item);

					// Skip node_modules, dist, build, out, .git
					if (fullPath.includes('node_modules') ||
						fullPath.includes('dist') ||
						fullPath.includes('build') ||
						fullPath.includes('out') ||
						fullPath.includes('.git')) {
						continue;
					}

					const stat = fs.statSync(fullPath);

					if (stat.isDirectory()) {
						scan(fullPath);
					} else if (stat.isFile()) {
						const ext = path.extname(item);
						if (extensions.includes(ext)) {
							files.push(fullPath);
						}
					}
				}
			} catch (error) {
				// Skip directories we can't read
			}
		}

		scan(directory);
		const message = `📁 Found ${files.length} files`;
		this.outputChannel.appendLine(message);
		if (this.chatbotPanel) {
			this.chatbotPanel.sendMessage(message, 'assistant');
			this.chatbotPanel.sendProgress(`📁 Found ${files.length} files to review`);
		}
		return { files };
	}

	async readFile(filePath: string): Promise<{ content: string }> {
		const content = fs.readFileSync(filePath, 'utf-8');
		const relativePath = this.getRelativePath(filePath);
		const message = `📖 Reading: ${relativePath}`;
		this.outputChannel.appendLine(`Reading: ${relativePath}`);
		if (this.chatbotPanel) {
			this.chatbotPanel.sendMessage(message, 'assistant');
			this.chatbotPanel.sendProgress(message);
		}
		return { content };
	}

	async writeFile(filePath: string, content: string): Promise<{ success: boolean }> {
		// Read current file content
		let originalContent = '';
		try {
			originalContent = fs.readFileSync(filePath, 'utf-8');
		} catch (error) {
			// File doesn't exist, treat as new file
			originalContent = '';
		}

		// If content is the same, no need to show suggestion
		if (originalContent === content) {
			const relativePath = this.getRelativePath(filePath);
			const message = `ℹ️  No changes needed: ${relativePath}`;
			this.outputChannel.appendLine(message);
			if (this.chatbotPanel) {
				this.chatbotPanel.sendMessage(message, 'assistant');
			}
			return { success: true };
		}

		// Generate diff
		const diff = this.generateDiff(originalContent, content);
		const relativePath = this.getRelativePath(filePath);

		// Send suggestion to chatbot panel instead of writing directly
		if (this.chatbotPanel) {
			this.chatbotPanel.sendCodeSuggestion({
				filePath: filePath,
				fileName: path.basename(filePath),
				originalContent: originalContent,
				suggestedContent: content,
				diff: diff,
				relativePath: relativePath
			});
		}

		// Return success but don't actually write yet - wait for user approval
		return { success: true };
	}

	private generateDiff(oldContent: string, newContent: string): { removed: string[], added: string[] } {
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');
		
		const removed: string[] = [];
		const added: string[] = [];
		
		// Simple line-by-line diff
		const maxLength = Math.max(oldLines.length, newLines.length);
		
		for (let i = 0; i < maxLength; i++) {
			if (i >= oldLines.length) {
				// New lines added
				added.push(newLines[i]);
			} else if (i >= newLines.length) {
				// Lines removed
				removed.push(oldLines[i]);
			} else if (oldLines[i] !== newLines[i]) {
				// Line changed
				removed.push(oldLines[i]);
				added.push(newLines[i]);
			}
		}
		
		return { removed, added };
	}

	private getTools() {
		return {
			'list_files': (args: { directory: string }) => this.listFiles(args.directory),
			'read_file': (args: { file_path: string }) => this.readFile(args.file_path),
			'write_file': (args: { file_path: string; content: string }) => this.writeFile(args.file_path, args.content)
		};
	}

	async reviewCode(directoryPath: string): Promise<void> {
		this.baseDirectory = directoryPath;
		this.outputChannel.appendLine(`🔍 Reviewing: ${directoryPath}\n`);
		this.outputChannel.show();

		if (this.chatbotPanel) {
			this.chatbotPanel.sendMessage(`🔍 Starting code review...`, 'assistant');
			this.chatbotPanel.sendProgress(`🔍 Starting code review...`);
		}

		const History: any[] = [{
			role: 'user',
			parts: [{ text: `Review and fix all JavaScript code in: ${directoryPath}` }]
		}];

		const tools = this.getTools();

		while (true) {
			try {
				const result = await this.ai.models.generateContent({
					model: 'gemini-2.5-flash',
					contents: History,
					config: {
						systemInstruction: `You are an expert JavaScript code reviewer and fixer.

**Your Job:**
1. Use list_files to get all HTML, CSS, JavaScript, and TypeScript files in the directory
2. Use read_file to read each file's content
3. Analyze for:
   
   **HTML Issues:**
   - Missing doctype, meta tags, semantic HTML
   - Broken links, missing alt attributes
   - Accessibility issues (ARIA, roles)
   - Inline styles that should be in CSS
   
   **CSS Issues:**
   - Syntax errors, invalid properties
   - Browser compatibility issues
   - Inefficient selectors
   - Missing vendor prefixes
   - Unused or duplicate styles
   
   **JavaScript Issues:**
   - BUGS: null/undefined errors, missing returns, type issues, async problems
   - SECURITY: hardcoded secrets, eval(), XSS risks, injection vulnerabilities
   - CODE QUALITY: console.logs, unused code, bad naming, complex logic

4. Use write_file to FIX the issues you found (write corrected code back)
5. After fixing all files, respond with a summary report in TEXT format

**Summary Report Format:**
📊 CODE REVIEW COMPLETE

Total Files Analyzed: X
Files Fixed: Y (only count files where write_file was actually called)

CRITICAL RULES:
1. Only list files that were ACTUALLY modified using write_file
2. For each file, specify the line number(s) and describe EXACTLY what was changed
3. Be specific: describe the actual code change, not just the problem category
4. Format: filename:line - Specific change description

🔴 SECURITY FIXES:
- file.js:line 15 - Replaced hardcoded API key 'abc123xyz' with process.env.API_KEY
- auth.js:line 42 - Removed eval(userInput) and replaced with safe JSON.parse(userInput)

🟠 BUG FIXES:
- app.js:line 28 - Added null check: if (!user) return; before accessing user.name
- index.html:line 12 - Added missing alt attribute: <img src="logo.png" alt="Company Logo">

🟡 CODE QUALITY IMPROVEMENTS:
- styles.css:line 45 - Removed duplicate .header { margin: 0; padding: 0; } rule
- script.js:line 67 - Removed console.log('User data:', userData) debug statement

If no files were fixed in a category, write: "No [category] fixes required."`,
						tools: [{
							functionDeclarations: [
								{
									name: 'list_files',
									description: 'Get all JavaScript files in a directory',
									parameters: {
										type: Type.OBJECT,
										properties: {
											directory: {
												type: Type.STRING,
												description: 'Directory path to scan'
											}
										},
										required: ['directory']
									}
								},
								{
									name: 'read_file',
									description: 'Read a file\'s content',
									parameters: {
										type: Type.OBJECT,
										properties: {
											file_path: {
												type: Type.STRING,
												description: 'Path to the file'
											}
										},
										required: ['file_path']
									}
								},
								{
									name: 'write_file',
									description: 'Write fixed content back to a file',
									parameters: {
										type: Type.OBJECT,
										properties: {
											file_path: {
												type: Type.STRING,
												description: 'Path to the file to write'
											},
											content: {
												type: Type.STRING,
												description: 'The fixed/corrected content'
											}
										},
										required: ['file_path', 'content']
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
						const args = functionCall.args;

						if (!name || !(name in tools)) {
							this.outputChannel.appendLine(`⚠️ Unknown function: ${name}`);
							continue;
						}

						const actionMap: { [key: string]: string } = {
							'list_files': '📌 Scanning files...',
							'read_file': '📌 Analyzing code...',
							'write_file': '📌 Applying fixes...'
						};
						const actionMessage = actionMap[name] || `📌 ${name}`;
						this.outputChannel.appendLine(`📌 ${name}`);
						if (this.chatbotPanel) {
							this.chatbotPanel.sendMessage(actionMessage, 'assistant');
							this.chatbotPanel.sendProgress(actionMessage);
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
						const formattedSummary = summary.replace(/```/g, '').trim();
						this.chatbotPanel.sendMessage(`✅ Code review complete!\n\n${formattedSummary}`, 'assistant');
					}
					vscode.window.showInformationMessage('Code review complete! Check the chatbot for details.');
					break;
				}
			} catch (error: any) {
				const errorMsg = error?.message || 'Unknown error occurred';
				this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
				if (this.chatbotPanel) {
					this.chatbotPanel.sendError(errorMsg);
				}
				vscode.window.showErrorMessage(`Code review failed: ${errorMsg}`);
				break;
			}
		}
	}
}


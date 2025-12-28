import * as vscode from 'vscode';
import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { ChatbotPanel } from './chatbotPanel';

export class CodeReviewer {
	private ai: GoogleGenAI;
	private outputChannel: vscode.OutputChannel;
	private chatbotPanel?: ChatbotPanel;

	constructor(apiKey: string, outputChannel: vscode.OutputChannel, chatbotPanel?: ChatbotPanel) {
		this.ai = new GoogleGenAI({ apiKey });
		this.outputChannel = outputChannel;
		this.chatbotPanel = chatbotPanel;
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
		this.outputChannel.appendLine(`Found ${files.length} files`);
		if (this.chatbotPanel) {
			this.chatbotPanel.sendProgress(`📁 Found ${files.length} files to review`);
		}
		return { files };
	}

	async readFile(filePath: string): Promise<{ content: string }> {
		const content = fs.readFileSync(filePath, 'utf-8');
		const fileName = path.basename(filePath);
		this.outputChannel.appendLine(`Reading: ${filePath}`);
		if (this.chatbotPanel) {
			this.chatbotPanel.sendProgress(`📖 Reading: ${fileName}`);
		}
		return { content };
	}

	async writeFile(filePath: string, content: string): Promise<{ success: boolean }> {
		fs.writeFileSync(filePath, content, 'utf-8');
		const fileName = path.basename(filePath);
		this.outputChannel.appendLine(`✍️  Fixed: ${filePath}`);
		if (this.chatbotPanel) {
			this.chatbotPanel.sendProgress(`✍️  Fixed: ${fileName}`);
		}
		return { success: true };
	}

	private getTools() {
		return {
			'list_files': (args: { directory: string }) => this.listFiles(args.directory),
			'read_file': (args: { file_path: string }) => this.readFile(args.file_path),
			'write_file': (args: { file_path: string; content: string }) => this.writeFile(args.file_path, args.content)
		};
	}

	async reviewCode(directoryPath: string): Promise<void> {
		this.outputChannel.appendLine(`🔍 Reviewing: ${directoryPath}\n`);
		this.outputChannel.show();

		if (this.chatbotPanel) {
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
Files Fixed: Y

🔴 SECURITY FIXES:
- file.js:line - Fixed hardcoded API key
- auth.js:line - Removed eval() usage

🟠 BUG FIXES:
- app.js:line - Added null check for user object
- index.html:line - Added missing alt attribute

🟡 CODE QUALITY IMPROVEMENTS:
- styles.css:line - Removed duplicate styles
- script.js:line - Removed console.log statements

Be practical and focus on real issues. Actually FIX the code, don't just report.`,
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

						this.outputChannel.appendLine(`📌 ${name}`);
						if (this.chatbotPanel) {
							const actionMap: { [key: string]: string } = {
								'list_files': '📁 Scanning files...',
								'read_file': '📖 Analyzing code...',
								'write_file': '✍️  Applying fixes...'
							};
							this.chatbotPanel.sendProgress(actionMap[name] || `Processing ${name}...`);
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
						this.chatbotPanel.sendMessage('✅ Code review complete!\n\n```\n' + summary + '\n```', 'assistant');
					}
					vscode.window.showInformationMessage('Code review complete! Check the output channel for details.');
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


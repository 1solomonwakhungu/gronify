// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

// Path to the Gronify CLI (relative to this extension)
const getCliPath = (): string => {
	// The CLI is in the sibling package, use the built JavaScript version
	return path.join(__dirname, '..', '..', 'cli', 'dist', 'index.js');
};

// Validate if text looks like JSON
function isValidJSON(text: string): boolean {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

// Validate if text looks like gron format
function isValidGron(text: string): boolean {
	const lines = text.trim().split('\n');
	return lines.some(line => line.includes('=') && (line.includes('json.') || line.includes('json[')));
}

// Enhanced error handling for CLI execution
function handleCliError(error: Error, command: string): string {
	const message = error.message.toLowerCase();
	
	if (message.includes('enoent') || message.includes('command not found')) {
		return `Gronify CLI not found. Please ensure the CLI is built and available.`;
	}
	
	if (message.includes('invalid json')) {
		return `Invalid JSON format. Please check your JSON syntax.`;
	}
	
	if (message.includes('invalid gron')) {
		return `Invalid Gron format. Please check your Gron syntax.`;
	}
	
	if (message.includes('permission denied')) {
		return `Permission denied. Please check file permissions.`;
	}
	
	if (command === 'flatten' && message.includes('parse')) {
		return `Cannot parse JSON. Please verify the JSON is valid.`;
	}
	
	if (command === 'unflatten' && message.includes('parse')) {
		return `Cannot parse Gron format. Please verify the Gron syntax.`;
	}
	
	// Default error message
	return `Gronify ${command} failed: ${error.message}`;
}
async function executeGronifyCommand(command: string, input: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const cliPath = getCliPath();
		const cliDir = path.dirname(cliPath);
		const args = [path.basename(cliPath), ...command.split(' ')];
		
		console.log(`Executing CLI: node ${args.join(' ')} in ${cliDir}`);
		
		const child = spawn('node', args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			cwd: cliDir  // Set working directory to CLI directory
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		child.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		child.on('close', (code) => {
			console.log(`CLI finished with code ${code}`);
			console.log(`stdout: ${stdout}`);
			console.log(`stderr: ${stderr}`);
			
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(`Gronify CLI exited with code ${code}: ${stderr}`));
			}
		});

		child.on('error', (error) => {
			reject(new Error(`Failed to spawn Gronify CLI: ${error.message}`));
		});

		// Send input to CLI via stdin
		child.stdin.write(input);
		child.stdin.end();
	});
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Gronify extension is now active!');

	// Register flatten command
	const flattenCommand = vscode.commands.registerCommand('gronify.flatten', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found. Please open a file first.');
			return;
		}

		const selection = editor.selection;
		const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);

		if (!text.trim()) {
			vscode.window.showWarningMessage('No content to flatten. Please select JSON text or ensure the file has content.');
			return;
		}

		// Validate JSON format
		if (!isValidJSON(text.trim())) {
			const action = await vscode.window.showWarningMessage(
				'The selected text does not appear to be valid JSON. Continue anyway?',
				'Continue', 'Cancel'
			);
			if (action !== 'Continue') {
				return;
			}
		}

		try {
			vscode.window.showInformationMessage('Flattening JSON with Gronify...');
			const result = await executeGronifyCommand('flatten', text);
			
			if (!result || !result.trim()) {
				vscode.window.showWarningMessage('Flatten operation completed but returned no results.');
				return;
			}
			
			// Create new document with the result
			const doc = await vscode.workspace.openTextDocument({
				content: result,
				language: 'plaintext'
			});
			
			await vscode.window.showTextDocument(doc);
			vscode.window.showInformationMessage('JSON flattened successfully!');
		} catch (error: any) {
			const friendlyMessage = handleCliError(error, 'flatten');
			vscode.window.showErrorMessage(friendlyMessage);
			console.error('Gronify flatten error:', error);
		}
	});

	// Register unflatten command
	const unflattenCommand = vscode.commands.registerCommand('gronify.unflatten', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found. Please open a file first.');
			return;
		}

		const selection = editor.selection;
		const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);

		if (!text.trim()) {
			vscode.window.showWarningMessage('No content to unflatten. Please select Gron text or ensure the file has content.');
			return;
		}

		// Validate Gron format
		if (!isValidGron(text.trim())) {
			const action = await vscode.window.showWarningMessage(
				'The selected text does not appear to be valid Gron format. Continue anyway?',
				'Continue', 'Cancel'
			);
			if (action !== 'Continue') {
				return;
			}
		}

		try {
			vscode.window.showInformationMessage('Unflattening Gron with Gronify...');
			const result = await executeGronifyCommand('unflatten', text);
			
			if (!result || !result.trim()) {
				vscode.window.showWarningMessage('Unflatten operation completed but returned no results.');
				return;
			}
			
			// Create new document with the result
			const doc = await vscode.workspace.openTextDocument({
				content: result,
				language: 'json'
			});
			
			await vscode.window.showTextDocument(doc);
			vscode.window.showInformationMessage('Gron unflattened successfully!');
		} catch (error: any) {
			const friendlyMessage = handleCliError(error, 'unflatten');
			vscode.window.showErrorMessage(friendlyMessage);
			console.error('Gronify unflatten error:', error);
		}
	});

	// Register search command
	const searchCommand = vscode.commands.registerCommand('gronify.search', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found. Please open a file first.');
			return;
		}

		const text = editor.document.getText();
		if (!text.trim()) {
			vscode.window.showWarningMessage('File is empty. Please open a file with JSON content.');
			return;
		}

		// Validate JSON format for search
		if (!isValidJSON(text.trim())) {
			const action = await vscode.window.showWarningMessage(
				'The file does not appear to contain valid JSON. Search may not work properly. Continue anyway?',
				'Continue', 'Cancel'
			);
			if (action !== 'Continue') {
				return;
			}
		}

		// Get search term from user
		const searchTerm = await vscode.window.showInputBox({
			prompt: 'Enter search term for JSON content',
			placeHolder: 'e.g., user.name or ".*email.*"',
			validateInput: (value) => {
				if (!value || !value.trim()) {
					return 'Search term cannot be empty';
				}
				return null;
			}
		});

		if (!searchTerm) {
			return;
		}

		try {
			vscode.window.showInformationMessage(`Searching for "${searchTerm}" with Gronify...`);
			const result = await executeGronifyCommand(`search ${searchTerm}`, text);
			
			// Create new document with the search results
			const content = result && result.trim() ? result : `No matches found for "${searchTerm}"`;
			const doc = await vscode.workspace.openTextDocument({
				content: content,
				language: 'plaintext'
			});
			
			await vscode.window.showTextDocument(doc);
			
			if (result && result.trim()) {
				vscode.window.showInformationMessage(`Search completed for "${searchTerm}" - found matches!`);
			} else {
				vscode.window.showInformationMessage(`Search completed for "${searchTerm}" - no matches found.`);
			}
		} catch (error: any) {
			const friendlyMessage = handleCliError(error, 'search');
			vscode.window.showErrorMessage(friendlyMessage);
			console.error('Gronify search error:', error);
		}
	});

	context.subscriptions.push(flattenCommand, unflattenCommand, searchCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}

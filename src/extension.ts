// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import OSS from 'ali-oss';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 获取 VSCode 当前打开的第一个工作区根目录
const workspaceFolders = vscode.workspace.workspaceFolders;
let envPath: string | undefined = undefined;

if (workspaceFolders && workspaceFolders.length > 0) {
	envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
} else {
	// 可选：如果没有打开工作区，可以考虑加载用户主目录下的 .env
	// envPath = path.join(require('os').homedir(), '.env');
}

if (envPath) {
	dotenv.config({ path: envPath });
} else {
	dotenv.config(); // fallback
}

function getOssConfig() {
	const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
	const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
	const bucket = process.env.OSS_BUCKET;
	const region = process.env.OSS_REGION;
	const ossPath = process.env.OSS_PATH || '';
	return { accessKeyId, accessKeySecret, bucket, region, ossPath };
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "upload-to-alioss" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('upload-to-alioss.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from upload-to-alioss!');
	});

	context.subscriptions.push(disposable);

	const uploadDisposable = vscode.commands.registerCommand('upload-to-alioss.uploadFile', async (uri?: vscode.Uri) => {
		let filePath: string | undefined;
		if (uri && uri.fsPath && fs.existsSync(uri.fsPath) && fs.statSync(uri.fsPath).isFile()) {
			// 右键文件
			filePath = uri.fsPath;
		} else {
			// 命令面板
			const fileUri = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: '选择要上传的文件',
			});
			if (!fileUri || fileUri.length === 0) {
				vscode.window.showWarningMessage('未选择文件');
				return;
			}
			filePath = fileUri[0].fsPath;
		}
		if (!filePath) {return;}

		const { accessKeyId, accessKeySecret, bucket, region, ossPath } = getOssConfig();
		let uploadPath = await vscode.window.showInputBox({ prompt: '请输入OSS目标路径（可带子目录）', value: ossPath });
		if (uploadPath === undefined) {return;}
		if (uploadPath && !uploadPath.endsWith('/')) {uploadPath += '/';}

		let finalAccessKeyId = accessKeyId;
		let finalAccessKeySecret = accessKeySecret;
		let finalBucket = bucket;
		let finalRegion = region;

		if (!accessKeyId || !accessKeySecret || !bucket || !region) {
			finalAccessKeyId = await vscode.window.showInputBox({ prompt: '请输入阿里云OSS AccessKeyId', value: accessKeyId });
			if (!finalAccessKeyId) {return;}
			finalAccessKeySecret = await vscode.window.showInputBox({ prompt: '请输入阿里云OSS AccessKeySecret', password: true, value: accessKeySecret });
			if (!finalAccessKeySecret) {return;}
			finalBucket = await vscode.window.showInputBox({ prompt: '请输入Bucket名称', value: bucket });
			if (!finalBucket) {return;}
			finalRegion = await vscode.window.showInputBox({ prompt: '请输入Region，例如oss-cn-hangzhou', value: region });
			if (!finalRegion) {return;}
		}

		const client = new OSS({
			region: finalRegion!,
			accessKeyId: finalAccessKeyId!,
			accessKeySecret: finalAccessKeySecret!,
			bucket: finalBucket!,
		});

		const fileName = filePath.split(/[\\/]/).pop() || 'upload.file';
		const ossObjectKey = (uploadPath || '') + fileName;

		try {
			const result = await client.put(ossObjectKey, fs.createReadStream(filePath));
			await vscode.window.showInformationMessage(`上传成功: ${result.url}`, '复制链接').then(action => {
				if (action === '复制链接') {
					vscode.env.clipboard.writeText(result.url);
					vscode.window.showInformationMessage('链接已复制到剪贴板');
				}
			});
		} catch (err: any) {
			vscode.window.showErrorMessage(`上传失败: ${err.message || err}`);
		}
	});

	context.subscriptions.push(uploadDisposable);

	const uploadFolderDisposable = vscode.commands.registerCommand('upload-to-alioss.uploadFolder', async (uri: vscode.Uri) => {
		const folderPath = uri?.fsPath;
		if (!folderPath || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
			vscode.window.showErrorMessage('请选择有效的文件夹');
			return;
		}

		const { accessKeyId, accessKeySecret, bucket, region, ossPath } = getOssConfig();
		if (!accessKeyId || !accessKeySecret || !bucket || !region) {
			vscode.window.showErrorMessage('OSS配置缺失，请在根目录添加.env文件并设置 OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_REGION');
			return;
		}

		let uploadPath = await vscode.window.showInputBox({ prompt: '请输入OSS目标路径（可带子目录）', value: ossPath });
		if (uploadPath === undefined) {return;}
		if (uploadPath && !uploadPath.endsWith('/')) {uploadPath += '/';}

		const client = new OSS({ region, accessKeyId, accessKeySecret, bucket });

		const files = fs.readdirSync(folderPath).filter(f => fs.statSync(path.join(folderPath, f)).isFile());
		if (files.length === 0) {
			vscode.window.showWarningMessage('文件夹下没有文件可上传');
			return;
		}

		for (const file of files) {
			const filePath = path.join(folderPath, file);
			const ossObjectKey = (uploadPath || '') + file;
			try {
				const result = await client.put(ossObjectKey, fs.createReadStream(filePath));
				await vscode.window.showInformationMessage(`上传成功: ${result.url}`, '复制链接').then(action => {
					if (action === '复制链接') {
						vscode.env.clipboard.writeText(result.url);
						vscode.window.showInformationMessage('链接已复制到剪贴板');
					}
				});
			} catch (err: any) {
				vscode.window.showErrorMessage(`上传失败: ${file} - ${err.message || err}`);
			}
		}
	});

	context.subscriptions.push(uploadFolderDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

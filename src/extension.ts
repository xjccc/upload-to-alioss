import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import OSS from 'ali-oss'
import dotenv from 'dotenv'
import tinify from 'tinify'
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import vscode from 'vscode'

// 获取 VSCode 当前打开的第一个工作区根目录
const workspaceFolders = vscode.workspace.workspaceFolders
let envPath: string | undefined

if (workspaceFolders && workspaceFolders.length > 0) {
  envPath = join(workspaceFolders[0].uri.fsPath, '.env')
} else {
  // 可选：如果没有打开工作区，可以考虑加载用户主目录下的 .env
  envPath = join(homedir(), '.env')
}

const envPathGlobal = envPath
if (envPath) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config() // fallback
}

function getOssConfig() {
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
  const bucket = process.env.OSS_BUCKET
  const region = process.env.OSS_REGION
  const ossPath = process.env.OSS_PATH || ''
  const urlPrefix = process.env.OSS_URL_PREFIX || ''
  const tinifyKey = process.env.TINIFY_KEY || ''
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    ossPath,
    urlPrefix,
    tinifyKey
  }
}

function updateEnvFile(newConfig: Record<string, string>) {
  const envPath = envPathGlobal
  if (!envPath) return
  let envContent = ''
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8')
  }
  const envLines = envContent.split('\n').filter(Boolean)
  const envObj: Record<string, string> = {}
  envLines.forEach((line) => {
    const [key, ...rest] = line.split('=')
    envObj[key] = rest.join('=')
  })
  // 只更新这四个OSS配置
  if (newConfig.OSS_ACCESS_KEY_ID) envObj.OSS_ACCESS_KEY_ID = newConfig.OSS_ACCESS_KEY_ID
  if (newConfig.OSS_ACCESS_KEY_SECRET) envObj.OSS_ACCESS_KEY_SECRET = newConfig.OSS_ACCESS_KEY_SECRET
  if (newConfig.OSS_BUCKET) envObj.OSS_BUCKET = newConfig.OSS_BUCKET
  if (newConfig.OSS_REGION) envObj.OSS_REGION = newConfig.OSS_REGION
  // 重新拼接
  const newEnvContent = Object.entries(envObj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(envPath, newEnvContent, 'utf-8')
}

async function ensureOssConfigAndClient(config: ReturnType<typeof getOssConfig>) {
  let { accessKeyId, accessKeySecret, bucket, region } = config

  if (!accessKeyId || !accessKeySecret || !bucket || !region) {
    accessKeyId =
      (await vscode.window.showInputBox({
        prompt: '请输入阿里云OSS AccessKeyId',
        value: accessKeyId
      })) || ''
    if (!accessKeyId)
      return {
        client: null,
        config: null
      }

    accessKeySecret =
      (await vscode.window.showInputBox({
        prompt: '请输入阿里云OSS AccessKeySecret',
        password: true,
        value: accessKeySecret
      })) || ''
    if (!accessKeySecret)
      return {
        client: null,
        config: null
      }

    bucket =
      (await vscode.window.showInputBox({
        prompt: '请输入Bucket名称',
        value: bucket
      })) || ''
    if (!bucket)
      return {
        client: null,
        config: null
      }

    region =
      (await vscode.window.showInputBox({
        prompt: '请输入Region，例如oss-cn-beijing',
        value: region
      })) || ''
    if (!region)
      return {
        client: null,
        config: null
      }

    updateEnvFile({
      OSS_ACCESS_KEY_ID: accessKeyId,
      OSS_ACCESS_KEY_SECRET: accessKeySecret,
      OSS_BUCKET: bucket,
      OSS_REGION: region
    })
  }

  try {
    const client = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket
    })
    return {
      client,
      config: {
        ...config,
        accessKeyId,
        accessKeySecret,
        bucket,
        region
      }
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(e.message || 'OSS初始化失败')
    return {
      client: null,
      config: null
    }
  }
}

function isImage(file: string) {
  return /\.(png|jpe?g)$/i.test(file)
}

async function compressImageIfNeeded(filePath: string, tinifyKey: string): Promise<string> {
  if (!tinifyKey || !isImage(filePath)) return filePath
  try {
    tinify.key = tinifyKey
    const ext = extname(filePath)
    const tmpName = `${basename(filePath, ext)}-${randomBytes(6).toString('hex')}${ext}`
    const compressedPath = join(tmpdir(), tmpName)
    const source = tinify.fromFile(filePath)
    await source.toFile(compressedPath)
    return compressedPath
  } catch (e) {
    console.error(e)
    return filePath
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "upload-to-alioss" is now active!')

  const output = vscode.window.createOutputChannel('OSS上传结果')

  const uploadDisposable = vscode.commands.registerCommand('upload-to-alioss.uploadFile', async (uri, uris) => {
    let filePaths: string[] = []

    // 资源管理器多选或单选
    if (uris && Array.isArray(uris) && uris.length > 0) {
      filePaths = uris.filter((u) => u && u.fsPath && existsSync(u.fsPath) && statSync(u.fsPath).isFile()).map((u) => u.fsPath)
    } else if (uri && uri.fsPath && existsSync(uri.fsPath) && statSync(uri.fsPath).isFile()) {
      filePaths = [uri.fsPath]
    } else {
      // 命令面板，弹出多选文件框
      const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: true,
        openLabel: '选择要上传的文件'
      })
      if (!fileUri || fileUri.length === 0) {
        output.appendLine('未选择文件')
        output.show(true)
        return
      }
      filePaths = fileUri.map((f) => f.fsPath)
    }

    if (!filePaths.length) {
      output.appendLine('未选择文件')
      output.show(true)
      return
    }

    const { client, config } = await ensureOssConfigAndClient(getOssConfig())
    if (!client || !config) {
      output.appendLine('OSS配置缺失或初始化失败，请检查.env或手动输入配置')
      output.show(true)
      return
    }

    let uploadPath = await vscode.window.showInputBox({
      prompt: '请输入OSS目标路径（可带子目录）',
      value: config.ossPath
    })
    if (uploadPath === undefined) {
      output.appendLine('未填写OSS目标路径')
      output.show(true)
      return
    }
    if (uploadPath && !uploadPath.endsWith('/')) {
      uploadPath += '/'
    }

    for (const filePath of filePaths) {
      const fileName = filePath.split(/[\\/]/).pop() || 'upload.file'
      const ossObjectKey = (uploadPath || '') + fileName
      const uploadFilePath = await compressImageIfNeeded(filePath, config.tinifyKey)
      try {
        const result = await client.put(ossObjectKey, createReadStream(uploadFilePath))
        const customUrl = config.urlPrefix ? `${config.urlPrefix}/${ossObjectKey}` : result.url
        output.appendLine(`上传成功: ${customUrl}`)
      } catch (err: any) {
        output.appendLine(`上传失败: ${fileName} - ${err.message || err}`)
      } finally {
        if (dirname(uploadFilePath) === tmpdir() && uploadFilePath !== filePath) {
          try {
            fs.unlinkSync(uploadFilePath)
          } catch {}
        }
      }
    }
    output.appendLine('全部上传完成')
    output.show(true)
  })

  context.subscriptions.push(uploadDisposable)

  const uploadFolderDisposable = vscode.commands.registerCommand('upload-to-alioss.uploadFolder', async (uri: vscode.Uri) => {
    const folderPath = uri?.fsPath
    if (!folderPath || !existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
      output.appendLine('请选择有效的文件夹')
      output.show(true)
      return
    }

    const { client, config } = await ensureOssConfigAndClient(getOssConfig())
    if (!client || !config) {
      output.appendLine('OSS配置缺失或初始化失败，请检查.env或手动输入配置')
      output.show(true)
      return
    }

    let uploadPath = await vscode.window.showInputBox({
      prompt: '请输入OSS目标路径（可带子目录）',
      value: config.ossPath
    })
    if (uploadPath === undefined) {
      output.appendLine('未填写OSS目标路径')
      output.show(true)
      return
    }
    if (uploadPath && !uploadPath.endsWith('/')) {
      uploadPath += '/'
    }

    const files = readdirSync(folderPath).filter((f) => statSync(join(folderPath, f)).isFile())
    if (files.length === 0) {
      output.appendLine('文件夹下没有文件可上传')
      output.show(true)
      return
    }
    for (const file of files) {
      const filePath = join(folderPath, file)
      const uploadFilePath = await compressImageIfNeeded(filePath, config.tinifyKey)
      const ossObjectKey = (uploadPath || '') + file
      try {
        const result = await client.put(ossObjectKey, createReadStream(uploadFilePath))
        const customUrl = config.urlPrefix ? `${config.urlPrefix}/${ossObjectKey}` : result.url
        output.appendLine(`上传成功: ${customUrl}`)
      } catch (err: any) {
        output.appendLine(`上传失败: ${file} - ${err.message || err}`)
      } finally {
        if (dirname(uploadFilePath) === tmpdir() && uploadFilePath !== filePath) {
          try {
            fs.unlinkSync(uploadFilePath)
          } catch {}
        }
      }
    }
    output.appendLine('全部上传完成')
    output.show(true)
  })

  context.subscriptions.push(uploadFolderDisposable)
}

// This method is called when your extension is deactivated
export function deactivate() {}

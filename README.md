# upload-to-alioss

VSCode 插件：一键上传文件或文件夹到阿里云 OSS，并在输出面板展示上传结果。

## 功能特性

- 支持右键单文件上传到阿里云 OSS
- 支持右键文件夹上传该文件夹下所有文件到阿里云 OSS
- 支持命令面板（Cmd/Ctrl+Shift+P）手动选择文件上传
- 上传结果、失败、警告等信息全部输出到"OSS上传结果"输出面板，便于复制和查看
- 支持自动读取/补全 .env 环境变量配置，首次填写后自动写入 .env
- **支持图片压缩**：如配置了 `TINIFY_KEY`，上传 png/jpg/jpeg 图片时会自动用 [tinify](https://tinypng.com/) 压缩后再上传，无则直接上传原图

## 快速开始

1. **安装依赖**
   - 需在项目根目录下有 .env 文件（首次上传时可自动生成）
   - 需有阿里云 OSS 账号和 Bucket
   - 如需图片压缩，需注册 tinify.com 并获取 API Key

2. **配置 .env**（示例）

```
OSS_ACCESS_KEY_ID=你的AccessKeyId
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称
OSS_REGION=oss-cn-beijing
OSS_PATH=your-default-paths
OSS_URL_PREFIX=https://your-cdn-domain
TINIFY_KEY=你的TinifyApiKey # 可选，配置后自动压缩图片
```

3. **使用方式**

- **右键上传**
  - 在资源管理器中右键单个文件，选择"上传文件到阿里云OSS"
  - 在资源管理器中右键文件夹，选择"上传文件夹到阿里云OSS"
- **命令面板上传**
  - 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Win），输入"上传文件到阿里云OSS"
  - 按提示选择文件

4. **查看上传结果**
   - 所有上传成功/失败/警告信息会输出到"OSS上传结果"面板（可在底部"输出"面板切换）
   - 链接可直接复制

## 主要命令

- `upload-to-alioss.uploadFile`：上传单个文件到 OSS
- `upload-to-alioss.uploadFolder`：上传文件夹下所有文件到 OSS

## 环境变量说明

- `OSS_ACCESS_KEY_ID`：阿里云 AccessKeyId
- `OSS_ACCESS_KEY_SECRET`：阿里云 AccessKeySecret
- `OSS_BUCKET`：Bucket 名称
- `OSS_REGION`：Region（如 oss-cn-beijing）
- `OSS_PATH`：上传时的默认 OSS 路径前缀（可选）
- `OSS_URL_PREFIX`：上传后访问链接的自定义前缀（如 CDN 域名，可选）
- `TINIFY_KEY`：Tinify API Key，配置后自动压缩图片（可选）

## 注意事项

- `.env` 文件建议放在项目根目录，已被 .gitignore 忽略
- 插件会自动补全缺失的 OSS 配置到 .env
- 仅支持上传文件夹下的一级文件（不递归子目录）
- 输出面板可纵向查看所有上传结果
- 图片压缩仅支持 png/jpg/jpeg 格式，压缩后临时文件自动清理

## 常见问题

- **未弹窗/无反馈？**
  - 请在"输出"面板切换到"OSS上传结果"查看详细日志
- **配置缺失？**
  - 首次上传时会自动弹窗补全并写入 .env
- **图片未压缩？**
  - 请检查 .env 是否正确配置 TINIFY_KEY，且图片为 png/jpg/jpeg 格式

## License

MIT

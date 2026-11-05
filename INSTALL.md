# CogniGuide 安装配置指南

CogniGuide 只在本机运行，浏览器地址是 <http://127.0.0.1:3000>。没有登录。上传的资料、题目和错题都存在本机；识别、出题和评分调用阿里云百炼（DashScope）。

下面按 macOS、Windows、Ubuntu 分开写。三套系统的配置项相同，差别在安装 Node.js、路径写法和是否开机自启。

## 1. 开始之前

- Node.js **22.13 或更新**（Node.js 22、24 都可以）。
- 一个百炼 API Key。
- 能访问 `dashscope.aliyuncs.com`。
- 磁盘上留出资料空间。PDF 和图片会原样保存，另外还有转写文本和本地向量索引。

在目标电脑上执行 `npm ci`。LanceDB 和画布库带有各系统的原生二进制，**不要把一台电脑的 `node_modules` 拷到另一台**，也不要在 Apple 芯片和 Intel Mac 之间互拷。

## 2. 获取 API Key

1. 打开阿里云百炼控制台：<https://bailian.console.aliyun.com/>。
2. 进入 API-KEY 页面，创建一个密钥。
3. 密钥只在创建时完整显示一次，复制后放到下面的 `.env.local` 里。

密钥形如 `sk-...`。不要把 `.env.local` 提交到 git，这个文件已经被忽略。

默认请求发往中国站：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

如果密钥是在国际站创建的，把 `DASHSCOPE_BASE_URL` 改成国际站的 OpenAI 兼容地址：

```text
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

密钥和地址必须属于同一个区域，否则会返回鉴权或模型不存在的错误。

## 3. 配置

三个系统都是同一份文件：`web/.env.local`。改完必须重启服务，Next.js 只在启动时读取它。

```text
DASHSCOPE_API_KEY=sk-把密钥贴在这里
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 留空表示使用 web/data。建议写绝对路径。
DATA_DIR=

MAX_UPLOAD_MB=25
MAX_PDF_PAGES=50

VISION_MODEL=qwen3-vl-plus
CHAT_MODEL=qwen-plus
EMBEDDING_MODEL=text-embedding-v4
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 必填 | 百炼密钥。留空时首页会提示，上传和出题无法进行。 |
| `DASHSCOPE_BASE_URL` | 中国站兼容地址 | 与密钥所属区域一致。 |
| `DATA_DIR` | `web/data` | 学科、资料、作答、错题和向量索引的目录。换电脑时拷贝这个目录即可带走全部学习数据。 |
| `VISION_MODEL` | `qwen3-vl-plus` | 识别图片和 PDF 每一页。`qwen-vl-max` 在百炼上会返回模型不存在，不要改成它。 |
| `CHAT_MODEL` | `qwen-plus` | 出题和评分。 |
| `EMBEDDING_MODEL` | `text-embedding-v4` | 搜索用的向量模型。改了之后，首页会要求重建索引；重建会沿用已有转写和题目，不用重新识别。 |
| `MAX_UPLOAD_MB` | `25` | 单个文件大小上限。 |
| `MAX_PDF_PAGES` | `50` | 单个 PDF 页数上限。超过时请拆成多个文件。 |

`DATA_DIR` 请写绝对路径，并使用正斜杠，三个系统都认：

```text
DATA_DIR=/Users/me/CogniGuide-data
DATA_DIR=D:/CogniGuide/data
DATA_DIR=/home/me/cogniguide-data
```

第一次启动会创建四个学科：Chinese、English、Math、Geography。中文学科的题目和反馈是中文，其余是英文。

## 4. macOS

### 安装 Node.js

到 <https://nodejs.org/> 下载 macOS 安装包（22.13 或更新），安装后打开「终端」：

```bash
node -v
npm -v
```

`node -v` 应显示 `v22.13` 或更高。用 Homebrew 也可以：

```bash
brew install node@22
brew link --overwrite node@22
```

### 安装并启动

假设项目在 `~/Documents/CogniGuide`：

```bash
cd ~/Documents/CogniGuide/web
cp .env.example .env.local
```

用文本编辑器打开 `.env.local`，填入 `DASHSCOPE_API_KEY`。然后：

```bash
npm ci
npm test
npm run build
npm run start
```

浏览器打开 <http://127.0.0.1:3000>。

开发时想改完即生效，用 `npm run dev` 代替 `npm run build` 和 `npm run start`。日常使用用 build + start。

停止服务：在运行它的终端按 `Ctrl+C`。

### 登录后自动启动（可选）

先确认下面这条在终端里能成功，并记下 `which npm` 的结果，例如 `/usr/local/bin/npm`。

保存为 `~/Library/LaunchAgents/com.cogniguide.plist`，把 `WorkingDirectory` 和 npm 路径改成自己的：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cogniguide</string>
  <key>WorkingDirectory</key>
  <string>/Users/你的用户名/Documents/CogniGuide/web</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/cogniguide.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/cogniguide.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.cogniguide.plist
```

取消：

```bash
launchctl unload ~/Library/LaunchAgents/com.cogniguide.plist
```

日志在 `/tmp/cogniguide.log`。改过 `.env.local` 或重新 build 之后，unload 再 load 一次。

## 5. Windows

### 安装 Node.js

到 <https://nodejs.org/> 下载 Windows 安装包（22.13 或更新）。安装时勾选 **Add to PATH**。安装完成后**重新打开** PowerShell：

```powershell
node -v
npm -v
```

### 安装并启动

假设项目在 `C:\Users\你的用户名\Documents\CogniGuide`：

```powershell
cd C:\Users\你的用户名\Documents\CogniGuide\web
Copy-Item .env.example .env.local
notepad .env.local
```

填入 `DASHSCOPE_API_KEY`。数据目录建议：

```text
DATA_DIR=D:/CogniGuide/data
```

然后：

```powershell
npm ci
npm test
npm run build
npm run start
```

浏览器打开 <http://127.0.0.1:3000>。停止服务在该窗口按 `Ctrl+C`。

开发模式同样是 `npm run dev`。

如果 PowerShell 提示无法运行脚本，这不影响 `npm` 本身。不要用管理员身份运行，普通用户即可。

### 登录后自动启动（可选）

先在项目里成功执行过 `npm run build`。任务计划程序里新建任务，触发器选「当前用户登录时」，操作里：

- 程序：`npm`
- 参数：`run start`
- 起始于：`C:\Users\你的用户名\Documents\CogniGuide\web`

也可以在 PowerShell 里创建（把路径换成自己的）：

```powershell
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run start" -WorkingDirectory "C:\Users\你的用户名\Documents\CogniGuide\web"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "CogniGuide" -Action $action -Trigger $trigger
```

`npm.cmd` 必须能在登录会话的 PATH 里找到。查看任务是否在跑：任务管理器里应有 `node.exe`。删除任务：

```powershell
Unregister-ScheduledTask -TaskName "CogniGuide" -Confirm:$false
```

## 6. Ubuntu

以下命令在 Ubuntu 22.04 和 24.04 上可用。系统自带的 `apt install nodejs` 版本过旧，不要用它。

### 安装 Node.js 22

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

`node -v` 应至少是 `v22.13`。如果 NodeSource 给出的 22 低于 22.13，改用 nvm 安装更新的 22：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# 按安装脚本的提示重新打开终端，然后：
nvm install 22
node -v
```

画布和 LanceDB 使用官方预编译包，不需要另外安装 Cairo 或编译工具。

### 安装并启动

```bash
cd ~/CogniGuide/web
cp .env.example .env.local
nano .env.local
```

填入密钥后：

```bash
npm ci
npm test
npm run build
npm run start
```

本机浏览器打开 <http://127.0.0.1:3000>。服务只监听 `127.0.0.1`，局域网里的其他设备打不开，也不需要放行防火墙端口。

### 开机自启（systemd 用户服务）

仓库里有 `deploy/cogniguide.service`。默认认为项目在 `~/CogniGuide`。如果不是，先编辑该文件里的 `WorkingDirectory`，或者复制后再改。

用 NodeSource 安装时，`npm` 一般在 `/usr/bin/npm`，按文件里的 `ExecStart=/usr/bin/env npm run start` 即可：

```bash
mkdir -p ~/.config/systemd/user
cp ~/CogniGuide/deploy/cogniguide.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cogniguide
```

用 nvm 安装时，systemd 读不到 nvm 的环境变量，必须写成 npm 的绝对路径。先执行 `which npm`，再把服务里的 `ExecStart` 改成类似：

```ini
ExecStart=/home/你的用户名/.nvm/versions/node/v22.22.0/bin/npm run start
```

改完执行 `systemctl --user daemon-reload` 和 `systemctl --user restart cogniguide`。

希望不登录也启动：

```bash
sudo loginctl enable-linger "$USER"
```

常用命令：

```bash
systemctl --user status cogniguide
journalctl --user -u cogniguide -f
systemctl --user restart cogniguide
systemctl --user disable --now cogniguide
```

改 `.env.local` 或重新 `npm run build` 之后，执行一次 `systemctl --user restart cogniguide`。

## 7. 确认安装成功

1. 浏览器打开 <http://127.0.0.1:3000>，能看到 Subjects 和 Quick Quiz。页面顶部有 Level，从 S1 · 中一 到 S6 · 中六。
2. 首页没有红色的 “API key is missing”。如果有，说明 `.env.local` 没填密钥，或改完后没有重启。
3. 进入一个学科，上传一张小的 PNG 或一页 PDF。状态会从处理中变成 Ready。这一步会调用百炼，通常需要几十秒。
4. 打开该资料，能看到题目并可以提交评分。
5. 可选：在 `web` 目录执行 `npm test`。测试不访问百炼，也不读取 `DATA_DIR` 里的真实资料。

## 8. 常见问题

**端口已被占用。** 另一个 CogniGuide 或别的程序占着 3000。先停掉旧进程再启动。macOS 和 Ubuntu：

```bash
lsof -iTCP:3000 -sTCP:LISTEN
```

Windows PowerShell：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

**首页提示缺少 API Key。** `web/.env.local` 中 `DASHSCOPE_API_KEY` 为空，或服务是在写入密钥之前启动的。保存文件后重启。

**模型不存在。** `VISION_MODEL` 保持 `qwen3-vl-plus`。`qwen-vl-max` 在当前百炼接口上不可用。密钥区域和 `DASHSCOPE_BASE_URL` 不一致时，也会报模型或鉴权错误。

**上传后一直处理中或失败。** 看该资料上的错误文字。PDF 超过 50 页、文件超过 25 MB、文件加密或图片里没有可识别的学习内容，都会失败。网络中断时，在学科页点 Retry；已经转写成功的文本不会重新识别。

**换了向量模型后无法搜索。** 这是预期行为。首页会提示重建索引，按按钮重建即可。

**Windows 上数据目录没生效。** 使用 `D:/CogniGuide/data` 这种写法，保存后重启。不要只写 `data`，那会相对于启动时的工作目录。

**Ubuntu 服务反复重启。** `journalctl --user -u cogniguide -f` 查看原因。常见情况是 `WorkingDirectory` 不是 `web` 目录，或 nvm 的 npm 没有写成绝对路径。

**从另一台电脑迁移。** 在新电脑按本文重新 `npm ci` 和 `npm run build`。把旧电脑的 `DATA_DIR` 整个目录拷过来，并在新的 `.env.local` 里指向它。不要拷贝 `node_modules` 或 `.next`。

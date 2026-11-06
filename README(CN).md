# CogniGuide

一个只在本机运行的学习站点。把笔记（PDF 或图片）上传到学科目录，CogniGuide 用视觉模型转写、建向量索引供语义搜索、出简答题，并对照原始笔记给你的作答评分。首页的 **Quick Quiz（随堂测验）** 会从所有学科抽题，也可以指定一个主题。

它只在你自己的电脑上运行（绑定 `127.0.0.1`），不需要登录。模型走哪个来源由 `web/.env.local` 里的 `MODEL_PROFILE` 决定：`cloud` 走阿里云百炼（DashScope），`local` 走同一台机器上的 Ollama，资料不出门。无论在两个方向上怎么切，都只需要重建一次搜索索引，转写和题目全部沿用。

英文版见 [README.md](README.md)。

## 1. 开始之前

- Node.js **22.13 或更新**（22、24 都可以）。
- 模型来源二选一：
  - **cloud**：一个百炼 / DashScope API Key，并且这台机器能访问 `dashscope.aliyuncs.com`。
  - **local**：同一台机器装 Ollama 并拉好三个模型（合计下载约 6.4 GB），全程离线可用。
- 给 `DATA_DIR` 留出磁盘空间。上传的文件原样保存，另外还有转写文本、题目、作答和向量索引。
- 除此之外不需要别的东西。仓库里还附带了现成的学习资料，方便你先试一次上传再用自己的笔记：`math/`（24 张手写数学页的照片，每张 4–5 MB）和 `datasets/English-Handwritten-Math-Notes-Dataset/`（100 个单页 PDF，CC-BY-4.0），第 5 节就用这些文件。`poster/` 和 `Project_Description.md` 是展示用的材料，程序不会读取。

`npm ci` 必须在将来运行本站点的电脑上执行。LanceDB 和画布库带的是各平台自己的原生二进制，**不要把一台电脑的 `node_modules`（或 `.next`）拷到另一台**，也不要在 Apple 芯片和 Intel Mac 之间互拷。

## 2. 选一个模型来源

### 2.1 云端：阿里云百炼 / DashScope

1. 打开百炼控制台：<https://bailian.console.aliyun.com/>。
2. 进入 API-KEY 页面，创建一个密钥。
3. 密钥只在创建时完整显示一次，复制后填进 `web/.env.local` 的 `DASHSCOPE_API_KEY`。

密钥形如 `sk-...`。不要把 `.env.local` 提交到 git，这个文件已经被忽略。

默认请求发往中国站：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

如果密钥是在国际站创建的，把 `DASHSCOPE_BASE_URL` 改成：

```text
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

密钥和地址必须属于同一个区域，否则会返回鉴权错误或者"模型不存在"。

### 2.2 本地：Ollama

装好 Ollama、启动它，然后拉三个模型（合计约 6.4 GB：`qwen2.5vl:3b` 3.0 GB、`qwen3:4b-instruct-2507-q4_K_M` 2.3 GB、`bge-m3` 1.1 GB，先确认磁盘够）：

```bash
# macOS
brew install ollama
brew services start ollama

# Ubuntu（安装脚本会装一个 systemd 服务，监听 127.0.0.1:11434）
curl -fsSL https://ollama.com/install.sh | sh

# Windows：到 https://ollama.com/download/windows 下载安装包
```

然后不管哪个系统都是：

```bash
ollama pull qwen2.5vl:3b
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull bge-m3
```

`CHAT_MODEL` 请用不带 thinking 的 `qwen3:4b-instruct-2507-q4_K_M`。默认的 `qwen3:4b` 是推理模型，会先生成一大段思考再回答；在一台 8 GB 的 Mac 上单次出题要 5 分钟以上，超过客户端 180 秒超时，出题和评分都会报 "Request timed out"。

小机器上的真实预期（以下在一台 8 GB 的 Apple 芯片 Mac 上测得）：

- 识别按 PDF 每页调用一次，大约 40–90 秒一页。三十页的资料要花几十分钟，不是几十秒。
- 搜索约 1 秒，批改一道题约 18 秒，一次随堂测验约 2 分钟。
- 出题和评分质量低于 `qwen-plus`，而且模型要和系统抢同一块 8 GB 内存。

代价小得多的折中做法：识别和出题继续走云端，只把 `EMBEDDING_MODEL` 放进 profile，让搜索跑在 Ollama 上。

不想在本机跑模型的话，把 `DASHSCOPE_BASE_URL` 指向另一台机器上的 Ollama 也可以，例如 `http://192.168.1.20:11434/v1`；CogniGuide 本身仍然只监听 `127.0.0.1`。

### 2.3 profile 怎么切换两个来源

项目里带了两个 profile：`web/profiles/cloud.env`（百炼）和 `web/profiles/local.env`（本机 Ollama）。在 `web/.env.local` 里加一行，改完重启服务：

```text
MODEL_PROFILE=local
```

profile 只覆盖五项：`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`VISION_MODEL`、`CHAT_MODEL`、`EMBEDDING_MODEL`。`DATA_DIR`、`MAX_UPLOAD_MB`、`MAX_PDF_PAGES` 仍然只认 `.env.local`，换 profile 不会动到你的学习数据。百炼密钥也留在 `.env.local`，不用抄进 profile；`local.env` 里那个 `DASHSCOPE_API_KEY=ollama` 只是占位，Ollama 不检查密钥内容，但客户端不接受空值。

`MODEL_PROFILE` 留空表示只用 `.env.local` 里的设置。

首页顶部会显示当前 profile、接口地址和三个模型名，用这一行确认切换有没有生效。如果 `MODEL_PROFILE` 指向一个不存在的文件，服务启动会直接报错，不会悄悄退回云端。

`cloud` 和 `local` 的向量模型不同（`text-embedding-v4` 对 `bge-m3`），所以每切一次首页都会提示重建索引。点 **Rebuild index** 即可，已有的转写和题目都沿用，不会重新识别。索引只有一份，来回切一次就要重建一次。

## 3. 配置文件：`web/.env.local`

三个系统都是同一份文件。Next.js 只在启动时读它，改完必须重启服务。

```text
DASHSCOPE_API_KEY=sk-把密钥贴在这里
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# cloud 或 local，对应 web/profiles/<名字>.env。留空表示只用本文件。
MODEL_PROFILE=

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
| `DASHSCOPE_API_KEY` | 用云端时必填 | 百炼密钥。留空时首页出现琥珀色提示 **"DASHSCOPE_API_KEY is not set."**，上传会被直接拒绝，免得排队到后台才发现无法识别。profile 可以提供。 |
| `DASHSCOPE_BASE_URL` | 中国站兼容地址 | 与密钥所属区域一致。用本地 Ollama 时是 `http://127.0.0.1:11434/v1`。 |
| `MODEL_PROFILE` | 空 | 填 `profiles/` 里的文件名（`cloud` 或 `local`），整体切换模型来源。 |
| `DATA_DIR` | `web/data` | 学科、资料、作答、错题和向量索引的目录。换电脑时拷这个目录即可带走全部学习数据。 |
| `VISION_MODEL` | `qwen3-vl-plus` | 识别图片和 PDF 每一页。`qwen-vl-max` 在百炼上会返回模型不存在，不要改成它。 |
| `CHAT_MODEL` | `qwen-plus` | 出题和评分。 |
| `EMBEDDING_MODEL` | `text-embedding-v4` | 搜索用的向量模型。改了之后首页会要求重建索引；重建沿用已有转写和题目，不用重新识别。 |
| `MAX_UPLOAD_MB` | `25` | 单个文件大小上限。 |
| `MAX_PDF_PAGES` | `50` | 单个 PDF 页数上限。超过时请拆成多个文件。 |

`DATA_DIR` 请写绝对路径，并使用正斜杠，三个系统都认：

```text
DATA_DIR=/Users/me/CogniGuide-data
DATA_DIR=D:/CogniGuide/data
DATA_DIR=/home/me/cogniguide-data
```

第一次启动会创建四个学科：Chinese、English、Math、Geography。中文学科的题目和反馈是中文，其余是英文。新建学科时在创建的那一刻选好语言。

## 4. 安装并启动

如果这台机器上还没有项目，先把它取下来。仓库是公开的，因为附带了上面那些示例资料，下载约有 130 MB：

```bash
git clone https://github.com/8jnfd9c5vb-sketch/cogniguide.git
```

在仓库页面下载 ZIP 也一样。两种方式都不含学习数据：`web/data` 没有提交到仓库，全新的副本只有四个默认学科，没有资料。

### 4.1 macOS

**项目是拷过来的，先清 quarantine。** 隔空投送或解压下载包带过来的项目，macOS 会给每个文件打上 `com.apple.quarantine`，原生库会被系统拒绝加载，`next start` 报 `library load disallowed by system policy` 退出，`next.config.ts` 也跟着加载失败。在项目外面执行：

```bash
xattr -r -d com.apple.quarantine ~/Documents/CogniGuide
find ~/Documents/CogniGuide -xattrname com.apple.quarantine | wc -l
```

计数应为 0。`node_modules/.bin` 里全是符号链接，递归不跟进，若还有残留就逐条清：

```bash
for f in ~/Documents/CogniGuide/web/node_modules/.bin/*; do xattr -s -d com.apple.quarantine "$f"; done
```

**Node.js。** 到 <https://nodejs.org/> 下载 macOS 安装包（22.13 或更新），装完打开「终端」确认：

```bash
node -v
npm -v
```

用 Homebrew 也可以：

```bash
brew install node@22
brew link --overwrite node@22
```

**建配置并启动。** 假设项目在 `~/Documents/CogniGuide`：

```bash
cd ~/Documents/CogniGuide/web
cp .env.example .env.local
```

用文本编辑器打开 `.env.local`：用 **cloud** 就填 `DASHSCOPE_API_KEY`；用 **local** 就按 2.2 节装好并启动 Ollama，然后设 `MODEL_PROFILE=local`，密钥那一行不用管（profile 会提供占位值）。然后：

```bash
npm ci
npm test
npm run build
npm run start
```

浏览器打开 <http://127.0.0.1:3000>，停止服务在运行它的终端按 `Ctrl+C`。

开发时想改完即生效，用 `npm run dev` 代替 build 和 start；日常使用用 build + start。

**登录后自动启动（可选）。** 先在终端确认 `npm run start` 能跑起来，并记下 npm 的位置：`which npm`。用 Node.js 官方安装包一般是 `/usr/local/bin/npm`；用 nvm 是 `/Users/你的用户名/.nvm/versions/node/v22.x.x/bin/npm`。launchd 不读你的 shell 配置，所以 plist 里必须写 npm 的绝对路径。

把下面这份存成 `~/Library/LaunchAgents/com.cogniguide.plist`，把 `WorkingDirectory` 和 npm 路径改成自己的：

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

取消：`launchctl unload ~/Library/LaunchAgents/com.cogniguide.plist`。日志在 `/tmp/cogniguide.log`。改过 `.env.local` 或重新 build 之后，unload 再 load 一次。用 `local` 的话还要确认 Ollama 也开机自启（`brew services start ollama` 会注册）。

### 4.2 Windows

**Node.js。** 到 <https://nodejs.org/> 下载 Windows 安装包（22.13 或更新），安装时勾选 **Add to PATH**。装完**重新打开** PowerShell，确认 `node -v` / `npm -v`。用本地模型的话，从 <https://ollama.com/download/windows> 装 Ollama，并拉好 2.2 节列的三个模型。

**建配置并启动。** 假设项目在 `C:\Users\你的用户名\Documents\CogniGuide`：

```powershell
cd C:\Users\你的用户名\Documents\CogniGuide\web
Copy-Item .env.example .env.local
notepad .env.local
```

用 **cloud** 就填 `DASHSCOPE_API_KEY`，顺手把数据目录设好：

```text
DATA_DIR=D:/CogniGuide/data
```

用 **local** 就确认 Ollama 在跑（`ollama list` 能看到三个模型），然后设 `MODEL_PROFILE=local`。然后：

```powershell
npm ci
npm test
npm run build
npm run start
```

浏览器打开 <http://127.0.0.1:3000>，停止服务在该窗口按 `Ctrl+C`。开发模式同样是 `npm run dev`。

如果 PowerShell 提示无法运行脚本，这不影响 `npm` 本身。不要用管理员身份运行，普通用户即可。

**登录后自动启动（可选）。** 前提是在项目里成功执行过 `npm run build`。任务计划程序里新建任务，触发器选「当前用户登录时」，操作里：

- 程序：`npm`
- 参数：`run start`
- 起始于：`C:\Users\你的用户名\Documents\CogniGuide\web`

也可以在 PowerShell 里创建（把路径换成自己的）：

```powershell
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run start" -WorkingDirectory "C:\Users\你的用户名\Documents\CogniGuide\web"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "CogniGuide" -Action $action -Trigger $trigger
```

`npm.cmd` 必须能在登录会话的 PATH 里找到。查看任务是否在跑：任务管理器里应有 `node.exe`。删除任务：`Unregister-ScheduledTask -TaskName "CogniGuide" -Confirm:$false`。

### 4.3 Ubuntu

以下命令在 Ubuntu 22.04 和 24.04 上可用。系统自带的 `apt install nodejs` 版本过旧，不要用它。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

`node -v` 应至少是 `v22.13`。如果 NodeSource 给出的 22 低于 22.13，改用 nvm：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# 按安装脚本的提示重新打开终端，然后：
nvm install 22
node -v
```

画布和 LanceDB 使用官方预编译包，不需要另外安装 Cairo 或编译工具。

用 **local** 的话先 `curl -fsSL https://ollama.com/install.sh | sh` 装 Ollama，再拉 2.2 节的三个模型。

```bash
cd ~/CogniGuide/web
cp .env.example .env.local
nano .env.local
```

填密钥（**cloud**）或设 `MODEL_PROFILE=local`（**local**），然后：

```bash
npm ci
npm test
npm run build
npm run start
```

本机浏览器打开 <http://127.0.0.1:3000>。服务只监听 `127.0.0.1`，局域网里的其他设备打不开，也不需要放行防火墙端口。

**开机自启（可选，systemd 用户服务）。** 仓库里有 `deploy/cogniguide.service`，默认认为项目在 `~/CogniGuide`；如果不是，先编辑该文件里的 `WorkingDirectory`。用 NodeSource 安装时 `npm` 一般在 `/usr/bin/npm`，按文件里的 `ExecStart=/usr/bin/env npm run start` 即可：

```bash
mkdir -p ~/.config/systemd/user
cp ~/CogniGuide/deploy/cogniguide.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cogniguide
```

用 nvm 安装时，systemd 读不到 nvm 的环境变量，`ExecStart` 必须写成 `which npm` 给出的绝对路径：

```ini
ExecStart=/home/你的用户名/.nvm/versions/node/v22.22.0/bin/npm run start
```

改完执行 `systemctl --user daemon-reload` 和 `systemctl --user restart cogniguide`。

希望不登录也启动：`sudo loginctl enable-linger "$USER"`。

```bash
systemctl --user status cogniguide
journalctl --user -u cogniguide -f
systemctl --user restart cogniguide
systemctl --user disable --now cogniguide
```

改 `.env.local` 或重新 `npm run build` 之后，执行一次 `systemctl --user restart cogniguide`。

## 5. 确认安装成功

1. 浏览器打开 <http://127.0.0.1:3000>，能看到 Subjects 和 Quick Quiz，页面顶部有 Level，从 S1 · 中一 到 S6 · 中六。
2. 检查表头下面那一行模型信息：显示当前 profile、接口地址和三个模型名。`MODEL_PROFILE=local` 时应该是 `http://127.0.0.1:11434/v1`、`qwen2.5vl:3b`、`qwen3:4b-instruct-2507-q4_K_M`、`bge-m3`。
3. 首页不该有琥珀色的 "DASHSCOPE_API_KEY is not set."。如果有，说明 `.env.local` 没填密钥（cloud），或者服务是在保存之前启动的。用 `MODEL_PROFILE=local` 时，让这条提示消失的是 `web/profiles/local.env` 里的占位密钥。
4. **刚切换过 profile 的话**，首页会出现一条琥珀色提示，说明索引是另一个向量模型建的。点 **Rebuild index** 并等它跑完；在此之前，搜索、带主题的随堂测验以及新上传资料的向量化都会回答 "The search index was built with ... Rebuild the index from the home page first."。随机随堂测验和 Subject Quiz 仍可正常使用，因为它们随机抽样，不比较向量。
5. 进入一个学科，上传一个小文件。仓库里有现成的例子：`math/Image_20261104204427_143_128.jpg`（一页手写数学）或 `datasets/English-Handwritten-Math-Notes-Dataset/linear-algebra-kalika102pages-3.pdf`（单页 PDF）。状态会从处理中变成 Ready。云端通常几十秒，`local` 每页要一两分钟。
6. 打开该资料，答一题并提交：评分能用，搜索也能搜到笔记内容。
7. 可选：在 `web` 目录执行 `npm test`。测试用临时数据，既不调百炼也不调 Ollama，也不读 `DATA_DIR` 里的真实资料。

## 6. 工作原理

- 上传支持 PDF、PNG、JPG/JPEG 和 WEBP。提交后立刻返回，后台一次处理一个文件：PDF 每页渲染成图片识别，文本切块并嵌入 LanceDB，然后写出最多五道题。凡是注定会被模型卡住的情况都在选文件这一步就拒绝，不会排到后台：类型不对、空文件、超过 `MAX_UPLOAD_MB`、页数超过 `MAX_PDF_PAGES`，以及加密或损坏的 PDF。服务重启时，被打断的任务会自己回到队列继续。学科页的 **Retry** 会重新识别整个文件，因为每一页都成功后转写稿才会落盘；资料一旦 Ready，Retry 就沿用已有的转写稿，只重新索引和重新出题。
- **搜索**：把提问转成向量，返回最接近的切块。余弦距离大于 0.75 的切块视为无关并丢弃，所以笔记里没有答案的问题会返回空，而不是硬凑一个。显示的片段会去掉下面说的工作纸杂项，但索引里存的仍是转写原文。
- 首页的 **Quick Quiz（随堂测验）** 固定五道题。主题留空时，它从所有学科随机抽十个切块，再把五题分配到这些学科，所以只要索引里有资料就能用。填了主题就改成先搜索一次，因此需要索引是最新的：内容不够接近时回答 *"None of your notes match "…". Try another topic or leave it empty for a random quiz."*，一份资料都没索引过时回答 *"There is no indexed material yet. Upload notes to a subject first."*
- 表头的 **Level** 决定难度，从香港 S1（中一）到 S6（中六），默认 S3，存在浏览器 cookie 里。练习题、随堂测验和评分都按当前 Level。题目按学科 + 资料 + Level 缓存：S3 的题在上传时就写好，其他 Level 第一次练习时现写。
- 出题器写的是新题：只借用笔记里的公式和方法，数字、名称和情境都另拟，所以不会照抄你已做过的题；参考答案是分编号的解题步骤，最后一行给出最终答案。答案里的算术先在本机校验，通不过就不采用；转录文字里与工作纸无关的内容（课程表头、页码、空题号、转录者的旁白）会被忽略。出题时会多要两份草稿（共七题），这样某份答案通不过校验只少一道题，不至于整组作废，最终取通过校验的前五题。题目文件带有版本号，旧版本写的题视为过期，下次打开这份资料对应的 Level 时自动重写——不用重新上传，也不用重建索引。改用 `local` 时，小模型往往写不出能通过校验的算术，因此那里更常退化成只给文字说明的答案。
- 每个学科页有 **Subject Quiz**：按当前 Level 从该学科的笔记里随机取样，写出五道新题。每一轮都是重新写的，不会复用旧题，因此云端大约要等一分钟，`local` 更久。学科还没有资料时，改为按香港课程的一般学科常识出五题，并标注 "General knowledge"。
- **错题（Mistakes）**：练习、随堂测验或学科测验里低于 60 分的作答都会进错题本。错题页列出你的答案、反馈和参考答案，可以发起一轮五题的复习，也可以只复习一个学科。仍在直接引用你笔记原文的那道错题会列在页面上，但复习轮会跳过它（出题器不会重考原题），卡片上会说明。同一题后来答到 60 分及以上就标记为已掌握，错题也可以手动删除。删除学科时，由该学科笔记产生的错题记录也一并删除；只删除某一份资料时，它留下的错题仍然留在错题本里——每条记录都自带题目和参考答案的副本，所以两种情况下都能正常显示。
- `DATA_DIR` 里的目录结构：

```
subjects/<学科>/subject.json
subjects/<学科>/materials/<id>/original.*、meta.json、extract.md、questions-<level>.json
attempts/<id>.json      已评分的作答（练习和随堂测验）
quizzes/<id>.json       随堂测验、学科测验和复习场次（隔天未用的场次会在下一次开始测验时删除）
mistakes/<id>.json      错题本，一题一个文件
rag/                    LanceDB 索引和 index.json（记录向量模型和维度）
```

## 7. 常见问题

**端口已被占用。** 另一个 CogniGuide 或别的程序占着 3000，先停掉旧进程再启动。macOS 和 Ubuntu：`lsof -iTCP:3000 -sTCP:LISTEN`。Windows PowerShell：`Get-NetTCPConnection -LocalPort 3000 -State Listen`。

**首页出现 "DASHSCOPE_API_KEY is not set."。** `.env.local` 里 `DASHSCOPE_API_KEY` 为空，而且没有 profile 提供密钥；或者服务是在写入密钥之前启动的。保存文件后重启。用 `MODEL_PROFILE=local` 时这条提示不该出现，因为 `web/profiles/local.env` 提供了占位密钥——如果仍然出现，说明 `MODEL_PROFILE` 是空的，服务只读了 `.env.local`。

**启动时报错提到 `MODEL_PROFILE`。** 值必须和 `web/profiles/` 里的文件名完全一致（`cloud` 或 `local`）。这种情况下服务宁可拒绝启动，也不会悄悄切回另一个来源。

**用 `local` 时报 "Connection error."。** Ollama 没在 `http://127.0.0.1:11434` 上监听。用 `ollama list` 确认；macOS 执行 `brew services start ollama`，或在终端跑 `ollama serve`。被 `ollama rm` 掉的模型要重新 pull。

**用 `local` 时报 "Request timed out"。** 单次调用超过了 180 秒客户端超时。最常见的原因是 `qwen3:4b` 在写思考，换成 `qwen3:4b-instruct-2507-q4_K_M`。小机器上页数多或题量大确实可能更久，可以重试，或者把出题留在云端。

**用 `cloud` 时报模型不存在。** `VISION_MODEL` 保持 `qwen3-vl-plus`，`qwen-vl-max` 在当前百炼接口上不可用。密钥区域和 `DASHSCOPE_BASE_URL` 不一致时，也会报模型或鉴权错误。

**选完文件就被拒绝。** 页面上直接写明原因：*"Only PDF, PNG, JPG and WEBP files are supported."*、*"File is empty."*、*"File is larger than 25 MB."*、*"This PDF has 130 pages; the limit is 50. Split it into smaller files."*、*"This PDF could not be opened. It may be damaged or password-protected."*（把照片改名成 `.pdf` 就是这句），以及 *"DASHSCOPE_API_KEY is not set. Add it to web/.env.local and restart the server."*。这些情况下什么都不会保存，也不会排进队列。

**上传后一直处理中或失败。** 看该资料上的错误文字。能被接受但读不出内容的情况发生在这一步：扫描太淡、图片里没有可识别的学习内容，识别会失败。被重启打断的上传会自己回到队列继续。**Retry** 会重新识别每一页，因为整份文件全部成功后转写稿才会保存——也就是说 30 页的 PDF 在第 29 页失败后，重试是从第 1 页重新识别。资料一旦 Ready，Retry 便沿用转写稿，只重建索引和题目。

**"These questions have been rewritten for this level. Reload the page to answer the new set."** 练习页还开着，而这一组题已被重写，按旧的题目 id 提交会全部评到错误的答案上。刷新页面做现在显示的那一组即可；被拒绝的那次作答没有记录。

**"This quiz has expired. Start a new one."** 测验应当在开始的当天完成；超过一天的场次会在下一次开始测验时删除。重新开一轮测验即可。

**换了向量模型后无法搜索。** 这是预期行为。首页会提示重建索引，按 **Rebuild index** 重建即可，转写和题目都沿用。

**Windows 上数据目录没生效。** 使用 `D:/CogniGuide/data` 这种写法，保存后重启。不要只写 `data`，那会相对于启动时的工作目录。

**Ubuntu 服务反复重启。** `journalctl --user -u cogniguide -f` 查看原因。常见情况是 `WorkingDirectory` 不是 `web` 目录，或 nvm 的 npm 没有写成绝对路径。

**从另一台电脑迁移。** 在新电脑按第 4 节重新 `npm ci` 和 `npm run build`，把旧电脑的 `DATA_DIR` 整个目录拷过来，并在新的 `.env.local` 里指向它。不要拷贝 `node_modules` 或 `.next`。如果原索引是另一个来源的向量模型建的，迁过去之后重建一次。

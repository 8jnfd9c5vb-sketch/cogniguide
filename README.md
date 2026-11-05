# CogniGuide

A local study site. Upload notes (PDF or images) into subject folders; CogniGuide transcribes them with a vision model, indexes them for semantic search, writes short-answer questions, and grades your answers against the original notes. **Quick Quiz** on the home page draws questions from all subjects, optionally focused on a topic.

It runs on your own computer only (bound to `127.0.0.1`), with no login. Model work goes to whichever source you select with `MODEL_PROFILE` in `web/.env.local`: `cloud` for Alibaba Cloud Bailian (DashScope), or `local` for Ollama on the same machine, so your notes never leave it. Switching either way needs one search-index rebuild; transcripts and questions are kept.

The Chinese version of this guide is [README(CN).md](<README(CN).md>).

## 1. What you need

- Node.js **22.13 or newer** (22 and 24 both work).
- One model source:
  - **cloud** — a Bailian / DashScope API key, and access to `dashscope.aliyuncs.com`.
  - **local** — Ollama on the same machine with three models pulled (~6.4 GB download). Works fully offline.
- Disk space for `DATA_DIR`: originals are stored as uploaded, plus transcripts, questions, answers and the vector index.

Run `npm ci` on the machine that will run the site. LanceDB and the canvas library ship native binaries per platform, so do not copy `node_modules` (or `.next`) between Windows, macOS and Linux, or between Apple-silicon and Intel Macs.

## 2. Choose a model source

### 2.1 Cloud: Bailian / DashScope

1. Open the Bailian console: <https://bailian.console.aliyun.com/>.
2. Go to the API-KEY page and create a key.
3. Copy it — the full value is shown only once — into `DASHSCOPE_API_KEY` in `web/.env.local`.

Keys look like `sk-...`. Never commit `.env.local`; it is already git-ignored.

Requests default to the China endpoint:

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

If your key was created on the International site, set `DASHSCOPE_BASE_URL` to:

```text
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

The key and the endpoint must belong to the same region, otherwise you get an auth error or "model not exist".

### 2.2 Local: Ollama

Install Ollama, start it, then pull the three models (about 6.4 GB total: `qwen2.5vl:3b` 3.0 GB, `qwen3:4b-instruct-2507-q4_K_M` 2.3 GB, `bge-m3` 1.1 GB):

```bash
# macOS
brew install ollama
brew services start ollama

# Ubuntu (installs a systemd service and serves on 127.0.0.1:11434)
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download the installer from https://ollama.com/download/windows
```

Then, on any OS:

```bash
ollama pull qwen2.5vl:3b
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama pull bge-m3
```

Use the non-thinking `qwen3:4b-instruct-2507-q4_K_M` for `CHAT_MODEL`. The plain `qwen3:4b` tag is a reasoning model: it writes a long "thinking" block first, which took over 5 minutes per quiz on an 8 GB Mac and blew the 180-second client timeout, so question writing and grading both failed with "Request timed out".

What to expect on a small machine — measured on an 8 GB Apple-silicon Mac:

- Transcription runs once per PDF page: roughly 40–90 seconds each. A 30-page PDF is tens of minutes, not tens of seconds.
- Search about 1 s, grading one answer about 18 s, a Quick Quiz about 2 minutes.
- Question quality is below `qwen-plus`, and the models compete with the OS for the same 8 GB of memory.

A cheaper middle path: keep vision and chat on cloud and put only `EMBEDDING_MODEL` in a profile, so search runs on Ollama.

To use Ollama on another machine instead of this one, point `DASHSCOPE_BASE_URL` at it, e.g. `http://192.168.1.20:11434/v1`. CogniGuide itself still listens on `127.0.0.1` only.

### 2.3 How profiles switch between them

Two profile files ship with the project: `web/profiles/cloud.env` (Bailian) and `web/profiles/local.env` (Ollama on this machine). Add one line to `web/.env.local` and restart:

```text
MODEL_PROFILE=local
```

A profile overrides exactly five keys: `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `VISION_MODEL`, `CHAT_MODEL`, `EMBEDDING_MODEL`. `DATA_DIR`, `MAX_UPLOAD_MB` and `MAX_PDF_PAGES` are only read from `.env.local`, so switching a profile never touches your study data. Your Bailian key stays in `.env.local` too — no need to copy it into a profile. The `DASHSCOPE_API_KEY=ollama` line in `local.env` is a placeholder: Ollama ignores the value, but the client rejects an empty one.

Leaving `MODEL_PROFILE` empty means "use only what is in `.env.local`".

The home page header shows the active profile, endpoint and all three model names — use that line to confirm a switch took effect. If `MODEL_PROFILE` names a file that does not exist, the server refuses to start instead of silently falling back to cloud.

`cloud` and `local` use different embedding models (`text-embedding-v4` vs `bge-m3`), so every switch makes the home page ask for an index rebuild. Click **Rebuild index**; transcripts and questions are reused. There is one index, so each flip costs one rebuild.

## 3. Configuration: `web/.env.local`

Same file on all three systems. Next.js reads it only at startup, so restart after every edit.

```text
DASHSCOPE_API_KEY=sk-your-key-here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# cloud or local, i.e. web/profiles/<name>.env. Empty = use this file only.
MODEL_PROFILE=

# Empty means web/data. An absolute path is better.
DATA_DIR=

MAX_UPLOAD_MB=25
MAX_PDF_PAGES=50

VISION_MODEL=qwen3-vl-plus
CHAT_MODEL=qwen-plus
EMBEDDING_MODEL=text-embedding-v4
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | (required for cloud) | Bailian key. When empty the home page shows an amber **"DASHSCOPE_API_KEY is not set."** banner and uploads are refused, so nothing is queued that could not be transcribed. A profile can supply it. |
| `DASHSCOPE_BASE_URL` | China endpoint | Must match the key's region. For local Ollama: `http://127.0.0.1:11434/v1`. |
| `MODEL_PROFILE` | (empty) | Name a file in `web/profiles/` (`cloud` or `local`) to switch every model setting at once. |
| `DATA_DIR` | `web/data` | Subjects, materials, answers, mistakes and the vector index. Copy this directory to move all study data. |
| `VISION_MODEL` | `qwen3-vl-plus` | Transcribes images and every PDF page. `qwen-vl-max` returns "model not exist" on Bailian — don't switch to it. |
| `CHAT_MODEL` | `qwen-plus` | Writes and grades questions. |
| `EMBEDDING_MODEL` | `text-embedding-v4` | Vectors for search. Changing it triggers the rebuild prompt; rebuilding reuses saved transcripts and questions. |
| `MAX_UPLOAD_MB` | `25` | Max size of one file. |
| `MAX_PDF_PAGES` | `50` | Max pages per PDF. Split longer documents. |

Write `DATA_DIR` as an absolute path with forward slashes — all three systems accept it:

```text
DATA_DIR=/Users/me/CogniGuide-data
DATA_DIR=D:/CogniGuide/data
DATA_DIR=/home/me/cogniguide-data
```

The first start creates four subjects: Chinese, English, Math, Geography. Chinese questions and feedback are in Chinese; every other subject uses English. New subjects pick their language when created.

## 4. Install and start

### 4.1 macOS

**If the project was copied over, clear quarantine first.** Files that arrive by AirDrop or from a downloaded archive carry `com.apple.quarantine`; the system then refuses to load the native libraries, `next start` exits with `library load disallowed by system policy`, and `next.config.ts` fails to load. Run this from outside the project:

```bash
xattr -r -d com.apple.quarantine ~/Documents/CogniGuide
find ~/Documents/CogniGuide -xattrname com.apple.quarantine | wc -l
```

The count should be 0. `node_modules/.bin` is full of symlinks, which recursion does not follow; if any remain, clear them one by one:

```bash
for f in ~/Documents/CogniGuide/web/node_modules/.bin/*; do xattr -s -d com.apple.quarantine "$f"; done
```

**Node.js.** Download the macOS installer (22.13 or newer) from <https://nodejs.org/>, then check in Terminal:

```bash
node -v
npm -v
```

Homebrew works too:

```bash
brew install node@22
brew link --overwrite node@22
```

**Create the config and start.** Assuming the project is in `~/Documents/CogniGuide`:

```bash
cd ~/Documents/CogniGuide/web
cp .env.example .env.local
```

Open `.env.local` in a text editor. For **cloud**, fill in `DASHSCOPE_API_KEY`. For **local**, install and start Ollama as in §2.2 and set `MODEL_PROFILE=local` — the profile supplies the placeholder key, so the `DASHSCOPE_API_KEY` line does not matter. Then:

```bash
npm ci
npm test
npm run build
npm run start
```

Open <http://127.0.0.1:3000>. Stop with `Ctrl+C`.

During development use `npm run dev` instead of build + start; for daily use keep build + start.

**Start at login (optional).** First confirm `npm run start` works in a terminal and note where npm is: `which npm`. With the Node.js pkg installer that is usually `/usr/local/bin/npm`; with nvm it is `/Users/yourname/.nvm/versions/node/v22.x.x/bin/npm`. launchd does not read your shell profile, so the plist must use an absolute npm path.

Save this as `~/Library/LaunchAgents/com.cogniguide.plist`, with your own `WorkingDirectory` and npm path:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cogniguide</string>
  <key>WorkingDirectory</key>
  <string>/Users/yourname/Documents/CogniGuide/web</string>
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

To cancel: `launchctl unload ~/Library/LaunchAgents/com.cogniguide.plist`. Log: `/tmp/cogniguide.log`. After editing `.env.local` or rebuilding, unload and load again. With `local`, also make sure Ollama starts at login (`brew services start ollama` registers it).

### 4.2 Windows

**Node.js.** Download the installer (22.13 or newer) from <https://nodejs.org/> and tick **Add to PATH**. **Reopen** PowerShell afterwards and check `node -v` / `npm -v`. For local models, install Ollama from <https://ollama.com/download/windows> and pull the models listed in §2.2.

**Create the config and start.** Assuming the project is in `C:\Users\yourname\Documents\CogniGuide`:

```powershell
cd C:\Users\yourname\Documents\CogniGuide\web
Copy-Item .env.example .env.local
notepad .env.local
```

For **cloud**, fill in `DASHSCOPE_API_KEY`, and set the data directory while you are there:

```text
DATA_DIR=D:/CogniGuide/data
```

For **local**, confirm Ollama is running (`ollama list` shows the three models) and set `MODEL_PROFILE=local`. Then:

```powershell
npm ci
npm test
npm run build
npm run start
```

Open <http://127.0.0.1:3000>; stop with `Ctrl+C` in that window. Development mode is `npm run dev` as well.

A PowerShell script-execution policy warning does not affect `npm` itself. Don't run as administrator — an ordinary user is enough.

**Start at login (optional).** Only after `npm run build` has succeeded. In Task Scheduler create a task with the trigger "When the user logs on" and:

- Program: `npm`
- Arguments: `run start`
- Start in: `C:\Users\yourname\Documents\CogniGuide\web`

Or register it from PowerShell (substitute your paths):

```powershell
$action = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run start" -WorkingDirectory "C:\Users\yourname\Documents\CogniGuide\web"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "CogniGuide" -Action $action -Trigger $trigger
```

`npm.cmd` must be on PATH in the login session. To check it is running: Task Manager should show `node.exe`. Remove: `Unregister-ScheduledTask -TaskName "CogniGuide" -Confirm:$false`.

### 4.3 Ubuntu

Works on 22.04 and 24.04. The distro `apt install nodejs` is far too old — don't use it.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

`node -v` must be at least `v22.13`. If NodeSource's 22 is older, use nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# reopen the terminal as the install script instructs, then:
nvm install 22
node -v
```

Canvas and LanceDB use official prebuilt binaries; no Cairo or build tools are needed.

For **local**, install Ollama with `curl -fsSL https://ollama.com/install.sh | sh`, then pull the three models from §2.2.

```bash
cd ~/CogniGuide/web
cp .env.example .env.local
nano .env.local
```

Fill in the key (**cloud**) or set `MODEL_PROFILE=local` (**local**), then:

```bash
npm ci
npm test
npm run build
npm run start
```

Open <http://127.0.0.1:3000> on that machine. The server binds to `127.0.0.1` only, so nothing else on the LAN can reach it and no firewall port has to be opened.

**Start at boot (optional).** `deploy/cogniguide.service` is a systemd user service; it assumes the project is in `~/CogniGuide` — edit `WorkingDirectory` if it is not. With NodeSource, npm is usually `/usr/bin/npm`, so the shipped `ExecStart=/usr/bin/env npm run start` is fine:

```bash
mkdir -p ~/.config/systemd/user
cp ~/CogniGuide/deploy/cogniguide.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cogniguide
```

With nvm, systemd cannot read your nvm environment, so `ExecStart` must use the absolute path from `which npm`:

```ini
ExecStart=/home/yourname/.nvm/versions/node/v22.22.0/bin/npm run start
```

Then `systemctl --user daemon-reload` and `systemctl --user restart cogniguide`.

To start without logging in: `sudo loginctl enable-linger "$USER"`.

```bash
systemctl --user status cogniguide
journalctl --user -u cogniguide -f
systemctl --user restart cogniguide
systemctl --user disable --now cogniguide
```

After editing `.env.local` or rebuilding, run `systemctl --user restart cogniguide` once.

## 5. Confirm the install

1. Open <http://127.0.0.1:3000>. You should see Subjects and Quick Quiz, and a Level selector in the header running from S1 · 中一 to S6 · 中六.
2. Check the model line under the header. It shows the active profile, endpoint and the three model names. With `MODEL_PROFILE=local` it must read `http://127.0.0.1:11434/v1`, `qwen2.5vl:3b`, `qwen3:4b-instruct-2507-q4_K_M`, `bge-m3`.
3. There should be no amber banner reading **"DASHSCOPE_API_KEY is not set."** If there is, `.env.local` has no key (cloud) or the service started before you saved it. With `MODEL_PROFILE=local` the placeholder key in `web/profiles/local.env` is what clears it.
4. **Right after switching profiles**, the home page shows an amber notice that the index was built with the other embedding model. Click **Rebuild index** and wait for it to finish. Until you do, search, a topic-focused Quick Quiz and the indexing step of a new upload answer *"The search index was built with ... Rebuild the index from the home page first."* A random Quick Quiz and a Subject Quiz still work, because they pick chunks without comparing vectors.
5. Go into a subject and upload a small PNG or a one-page PDF. The status moves from processing to Ready — tens of seconds on cloud, a minute or two per page on `local`.
6. Open that material, answer a question and submit. Grading works, and search finds the notes.
7. Optional: `npm test` in `web`. The tests use temporary data and call neither Bailian nor Ollama.

## 6. How it works

- Uploads return immediately and are processed in the background, one at a time: each PDF page is rendered to an image and transcribed, the text is split into chunks and embedded into LanceDB, then up to five questions are written. Interrupted jobs resume by themselves when the server restarts. **Retry** on the subject page re-transcribes the whole file, because a transcript is only saved once every page has succeeded; once the material is Ready, a retry reuses the transcript and only re-indexes and rewrites questions.
- **Search** embeds your wording and returns the chunks nearest to it. Anything whose cosine distance is above 0.75 is treated as unrelated and dropped, so a question your notes do not answer comes back empty rather than guessed at. A snippet is shown with the workbook furniture removed (see the question writer below); the index itself keeps the transcript as written.
- The **Level** selector picks the difficulty, from Hong Kong S1 (中一) to S6 (中六); the default is S3, stored in a browser cookie. Practice questions, Quick Quiz and grading all follow the current level. Questions are cached per material and level: S3 questions are written during upload, other levels the first time you practise at that level.
- The question writer sets new problems: it uses the formulas and methods in your notes but invents its own numbers, names and context, so a question never repeats one you have already seen, and each reference answer is numbered working steps ending in a final answer. Arithmetic in an answer key is checked on your machine before the question is kept, and workbook furniture in a transcript (course headers, page marks, empty question numbers, the transcriber's own comments) is ignored. Seven drafts are asked for so that a key failing a check costs one question, not the set; the first five that pass become the questions. Question files are versioned, so sets written by an older prompt count as stale and are rewritten the next time you open that material and level - no re-upload, no index rebuild. On the `local` profile the small model often cannot produce checkable arithmetic, so expect the prose-only fallback there more often.
- Each subject page has a **Subject Quiz**: five random questions from that subject's notes at the current level. Nothing is reused - the set is written fresh for every round, so expect about a minute on `cloud` and longer on `local`. A subject with no notes yet gets five questions from general subject knowledge (Hong Kong curriculum) instead, marked "General knowledge".
- **Mistakes**: every answer scoring below 60 (in practice, Quick Quiz or a subject quiz) is saved to the mistake log. The Mistakes page lists them with your answer, the feedback and the reference answer, and can start review rounds of five, optionally for one subject. A logged question that still quotes your own notes is counted but skipped by a review round, because the writer will not re-ask it, and the card says so. A question later answered with 60 or more is marked mastered; mistakes can also be removed by hand. Deleting a subject also deletes the mistake entries built from its notes.
- Data layout under `DATA_DIR`:

```
subjects/<subject>/subject.json
subjects/<subject>/materials/<id>/original.*, meta.json, extract.md, questions-<level>.json
attempts/<id>.json      graded answers (practice and Quick Quiz)
quizzes/<id>.json       Quick Quiz, subject quiz and review sessions (one a day old is deleted when the next quiz starts)
mistakes/<id>.json      mistake log, one file per question
rag/                    LanceDB index and index.json (embedding model and dimension)
```

## 7. Troubleshooting

**Port in use.** Another CogniGuide or app holds 3000; stop it first. macOS / Ubuntu: `lsof -iTCP:3000 -sTCP:LISTEN`. Windows PowerShell: `Get-NetTCPConnection -LocalPort 3000 -State Listen`.

**"DASHSCOPE_API_KEY is not set." on the home page.** `DASHSCOPE_API_KEY` is empty in `.env.local` and no profile supplies one, or the server started before you saved the file. Save and restart. With `MODEL_PROFILE=local` this banner cannot appear, because `web/profiles/local.env` supplies the placeholder key - if you see it while meaning to run locally, `MODEL_PROFILE` is empty and the server is reading `.env.local` only.

**Startup error naming `MODEL_PROFILE`.** The value must match a file in `web/profiles/` exactly (`cloud` or `local`). The server refuses to start rather than silently falling back to the other source.

**"Connection error." with `local`.** Ollama is not reachable at `http://127.0.0.1:11434`. Check `ollama list`; on macOS `brew services start ollama`, or run `ollama serve` in a terminal. A model that was `ollama rm`'d has to be pulled again.

**"Request timed out" with `local`.** The call exceeded the 180-second client timeout. Most often it is `qwen3:4b` thinking instead of answering — use `qwen3:4b-instruct-2507-q4_K_M`. On a small machine a heavy page or a long quiz can also legitimately take longer; retry, or keep chat on cloud.

**"Model not exist" with `cloud`.** Keep `VISION_MODEL=qwen3-vl-plus`; `qwen-vl-max` is unavailable on the current Bailian endpoint. A key from a different region than `DASHSCOPE_BASE_URL` also produces model or auth errors.

**Upload stuck processing, or failed.** Read the error shown on the material. PDFs over 50 pages, files over 25 MB, encrypted files, and images with no readable study content all fail. An upload interrupted by a restart resumes from the queue by itself. **Retry** re-recognises every page, because a transcript is saved only once the whole file has succeeded - so a 30-page PDF that failed on page 29 is transcribed again from page 1.

**"These questions have been rewritten for this level. Reload the page to answer the new set."** The practice page was open while its questions were regenerated, so the answers you are about to submit would be graded against the wrong key. Reload and answer the set now on the page; the attempt that was refused was not recorded.

**"This quiz has expired. Start a new one."** A quiz is meant to be answered the day it starts; a session older than a day is deleted when the next quiz begins. Start a new quiz.

**Search stopped working after changing `EMBEDDING_MODEL`.** Expected. The home page asks for a rebuild — press **Rebuild index**. Transcripts and questions are reused.

**`DATA_DIR` ignored on Windows.** Use `D:/CogniGuide/data` and restart. A relative value like `data` resolves against whatever directory the server was started from.

**Ubuntu service keeps restarting.** `journalctl --user -u cogniguide -f`. Usual causes: `WorkingDirectory` is not the `web` directory, or nvm's npm is not written as an absolute path in `ExecStart`.

**Moving to another computer.** Follow §4 on the new machine (`npm ci` + `npm run build`), copy the whole old `DATA_DIR` across, and point the new `.env.local` at it. Don't copy `node_modules` or `.next`. If the index was built by the other source's embedding model, rebuild once after the move.

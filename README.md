# n8n-nodes-opencode-v2

An [n8n](https://n8n.io/) community node for [OpenCode](https://opencode.ai/) **V2** servers.

With it a workflow can:

- **Run a chatbot** where every conversation keeps its own OpenCode session, so the agent remembers what was said.
- **Pick the agent per message.** The same agent can keep answering, or another agent can take over *inside the same session*, with the whole history.
- **Hand tasks to an agent** that uses its tools (read, edit, shell, MCP servers…), with a permission preset you choose.
- **Be used as a tool** by n8n's AI Agent node.

> OpenCode V2 only (`opencode serve`, version ≥ 2.1). The V1 API is not supported.

## Contents

- [Installation](#installation)
- [Credentials](#credentials)
- [Build a chatbot](#build-a-chatbot)
- [Switch agents within a conversation](#switch-agents-within-a-conversation)
- [Operations](#operations)
- [Permissions](#permissions)
- [Let OpenCode call your n8n workflows](#let-opencode-call-your-n8n-workflows)
- [Use the node as an AI Agent tool](#use-the-node-as-an-ai-agent-tool)
- [Troubleshooting](#troubleshooting)

## Installation

In n8n go to **Settings → Community Nodes → Install** and enter `n8n-nodes-opencode-v2`.

See the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for self-hosted details.

## Credentials

You need a running OpenCode V2 server, for example in a container:

```bash
OPENCODE_SERVER_PASSWORD=change-me opencode serve --hostname 0.0.0.0 --port 4096
```

Create an **OpenCode V2 API** credential:

| Field | Value |
|---|---|
| Server URL | Where n8n reaches the server, e.g. `http://opencode:4096`. When n8n and OpenCode share a Docker network, use the internal address: replies can take minutes, and public reverse proxies may cut long requests. |
| Username | `opencode` (fixed by OpenCode) |
| Password | The server password (`OPENCODE_SERVER_PASSWORD` or `OPENCODE_PASSWORD`) |

**Test** calls `GET /api/info`.

## Build a chatbot

```
Chat Trigger ──► OpenCode V2 (Chat → Send Message) ──► (reply goes back to the chat)
```

1. Add a **Chat Trigger** node.
2. Add **OpenCode V2**, resource **Chat**, operation **Send Message**. The defaults already match the Chat Trigger:
   - **Conversation Key**: `{{ $json.sessionId }}`
   - **Message**: `{{ $json.chatInput }}`
3. Set **Working Directory** to a folder on the OpenCode server that has no project plugins (the default `/tmp` works everywhere; see [Slow replies](#slow-replies-the-message-takes-a-long-time-to-be-accepted)).
4. For a Chat Trigger in "When last node finishes" mode, the reply is the `reply` field. Add a **Set** node that maps `output` = `{{ $json.reply }}`.

**How conversations map to sessions.** The node derives the session id from the conversation key (`chat-42` → `ses_n8n_chat-42`). OpenCode returns the existing session when it receives an id it already knows, so the same key always continues the same session and nothing is stored in n8n. Any other trigger works the same way: use a Telegram chat id, a WhatsApp number or a webhook field as the key. A full session id (`ses_…`) is used as-is.

The history lives in OpenCode, which also compacts it when it grows, so the workflow does not need an n8n memory node.

**Output**

```json
{
  "conversationKey": "chat-42",
  "sessionId": "ses_n8n_chat-42",
  "messageId": "msg_…",
  "reply": "Antonio",
  "agent": "plan",
  "model": "opencode/big-pickle",
  "agentSwitched": true,
  "admittedMs": 820,
  "status": "succeeded",
  "finish": "stop",
  "toolsUsed": [{ "name": "read", "status": "completed" }],
  "cost": 0.0012,
  "tokens": { "input": 13253, "output": 6, "reasoning": 16, "cache": { "read": 0, "write": 0 } }
}
```

`status` is `succeeded`, `failed`, `interrupted`, `timeout` or `running`. On failure `error` holds the reason. `admittedMs` is how long OpenCode took to accept the message before the agent started.

**Reset** a conversation with **Chat → Reset Conversation**: the next message starts a new session. **Chat → Get History** returns the user and assistant messages.

## Switch agents within a conversation

**Agent** is a parameter of every message. When it differs from the session's current agent, the node switches the session to it before sending the message (`POST /api/session/:id/agent`). The session and its history stay the same: the new agent reads the whole conversation and answers the next turns. Leave it empty to keep the current agent.

Route messages to agents with any n8n logic, for example:

```
Chat Trigger ──► Switch / Text Classifier ──► Set { agent: "plan" | "build" | "support" }
                                             └──► OpenCode V2 (Agent: {{ $json.agent }})
```

The output field `agent` tells which agent answered. A **model** can also be set per message (**Options → Model**, `provider/model`).

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Chat | Send Message | Continue (or start) the conversation session, wait, return the reply |
| Chat | Get History | User and assistant messages of the conversation |
| Chat | Reset Conversation | Delete the conversation session |
| Session | Send Prompt | Run a task in a new or existing session. Turn **Wait for Completion** off to return at once |
| Session | Get Result | Reply to a prompt sent without waiting (pass its `messageId`) |
| Session | Switch Agent | Change the agent for the next turns |
| Session | Interrupt | Stop the running turn |
| Session | Get / Get Many / Delete | Manage sessions |
| Permission | Get Pending / Reply | List and answer actions waiting for approval |
| Command | Run | Run a slash command in a session |

**Waiting.** The node waits in short long-poll slices (`/api/experimental/session/:id/wait`), checking the session timeline between them, and falls back to polling if that route is unavailable. **Options → Timeout** limits the wait. **On Timeout** can interrupt the agent and return what it produced, return without interrupting, or fail.

**Delivery** (Chat options): `steer` (default) joins a running turn at its next step; `queue` waits for the current turn to end.

## Permissions

A workflow has nobody to click "Allow", so the node sets the session rules for you:

| Preset | Allows | Denies |
|---|---|---|
| Read Only (default) | read, glob, grep, webfetch, websearch, skill, todowrite | everything else (edits, shell, MCP tools…) |
| Workspace Write | all tools | shell |
| Full Auto | all tools | — |
| Agent Defaults | the agent's and server's own rules | — |
| Custom (JSON) | your rules | your rules |

Every preset except Agent Defaults also denies `question` (asking the user) and `external_directory` (files outside the working directory). Session rules apply after the agent's rules, and the last matching rule wins. Custom rules look like:

```json
[
  { "action": "*", "resource": "*", "effect": "deny" },
  { "action": "read", "resource": "*", "effect": "allow" },
  { "action": "n8n_send_invoice", "resource": "*", "effect": "allow" }
]
```

Actions are tool names (`read`, `edit`, `shell`, `glob`, `grep`, `webfetch`, `websearch`, `subagent`, `skill`, `question`…). MCP tools are `<server>_<tool>`.

With **Auto-Reject Permission Requests** on (default), any action that still asks for approval is rejected, so the run does not hang until the timeout. The rejected actions are listed in `rejectedPermissions`. To approve actions from n8n instead, turn it off and use **Permission → Get Pending / Reply**.

## Let OpenCode call your n8n workflows

OpenCode agents can call n8n workflows as tools through MCP. This needs no extra code:

1. In n8n, create a workflow that starts with an **MCP Server Trigger**, add your tool nodes, and set Bearer authentication. Copy its production URL.
2. Register it in the OpenCode server config (`opencode.json`):

   ```json
   {
     "mcp": {
       "n8n": {
         "type": "remote",
         "url": "http://n8n:5678/mcp/<path>",
         "headers": { "authorization": "Bearer <token>" }
       }
     }
   }
   ```

3. The agent now sees tools named `n8n_<tool>`. With a restrictive preset, allow them explicitly with a custom rule (`"action": "n8n_*"`).

## Use the node as an AI Agent tool

The node is marked `usableAsTool`. Self-hosted n8n only exposes community nodes as tools when this is set on the n8n instance:

```bash
N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

## Troubleshooting

### Slow replies: the message takes a long time to be accepted

Check `admittedMs` in the output. OpenCode runs the **prompt hooks of every plugin loaded for the working directory before it accepts a message**, and the node can only wait. Memory plugins are the usual cause: the Hindsight coding-agents plugin, for example, runs a `reflect` call against its server on the first turns of every session (up to its `HINDSIGHT_REFLECT_TIMEOUT_MS`, plus a fallback). With a slow or failing memory server that adds close to a minute per message.

Keeping OpenCode "warm" does not help: the delay is per message and per new session, not a cold start. What helps:

- **Use a working directory without project plugins** (each folder loads its own `opencode.json` and `.opencode/`). Measured on OpenCode 2.1.4: ~1 s to accept a message in a plugin-free folder, ~53 s in a folder whose memory plugin timed out.
- Or tune the plugin on the server: for Hindsight, `HINDSIGHT_AUTO_INJECT=none` (no automatic reflect) or a lower `HINDSIGHT_REFLECT_TIMEOUT_MS`.

OpenCode also unloads a folder after 60 minutes without session activity. Reloading it costs a few seconds on the next message, far less than plugin hooks.

### Other problems

- **`SessionNotFoundError` on Get Result / Interrupt.** Pass a full session id (`ses_…`), not the conversation key.
- **`LocationNotFoundError`.** The working directory does not exist on the OpenCode server. Create it there, or use one that exists.
- **Requests cut after ~60 s.** A reverse proxy in front of OpenCode is closing long requests. Point the credential at the internal URL.

## Development

```bash
npm install
npm run build      # n8n-node build
npm run lint       # n8n-node lint
npm test           # node --test (unit tests with a fake n8n context)
npm run dev        # local n8n with the node linked
```

## License

[MIT](LICENSE)

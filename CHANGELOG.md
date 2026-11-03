# Changelog

## 0.1.1

- Default working directory is now `/tmp`: it exists on every server and loads no project plugins, whose prompt hooks can delay each message by tens of seconds.
- Output includes `admittedMs`, the time OpenCode took to accept the message.
- README: troubleshooting for slow message admission (plugin prompt hooks) and `LocationNotFoundError`.

## 0.1.0

- Chat resource: Send Message (one OpenCode session per conversation key, agent and model per message, permission presets, wait with timeout), Get History, Reset Conversation.
- Session resource: Send Prompt (wait or fire-and-forget), Get Result, Switch Agent, Interrupt, Get, Get Many, Delete.
- Permission resource: Get Pending, Reply.
- Command resource: Run.
- `usableAsTool` for n8n AI Agent.

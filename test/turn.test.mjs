// Unit tests for the compiled node (dist). Run "npm run build" first; "npm test" does both.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeChat } from "../dist/nodes/OpenCode/actions/chat.js";
import { waitForTurn } from "../dist/nodes/OpenCode/helpers/session.js";
function fakeContext(parameters, handler) {
  const calls = [];
  const node = { name: "OpenCode V2", type: "openCode", typeVersion: 1, parameters: {} };
  const ctx = {
    getNode: () => node,
    getCredentials: async () => ({ baseUrl: "http://opencode:4096/", username: "opencode", password: "x" }),
    getNodeParameter: (name, _index, fallback) => name in parameters ? parameters[name] : fallback,
    getWorkflow: () => ({ name: "test" }),
    helpers: {
      httpRequestWithAuthentication: async (_credential, options) => {
        calls.push(options);
        return handler(options);
      }
    }
  };
  return { calls, ctx };
}
const model = { providerID: "bifrost", id: "free-first" };
function sessionInfo(overrides = {}) {
  return {
    id: "ses_n8n_chat-1",
    agent: "build",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    location: { directory: "/srv/bot" },
    time: { created: 1, updated: 1 },
    ...overrides
  };
}
describe("Chat \u2192 Send Message", () => {
  const baseParameters = {
    conversationKey: "chat-1",
    message: "\xBFC\xF3mo me llamo?",
    directory: "/srv/bot",
    permissionPreset: "readOnly",
    options: { timeout: 30 }
  };
  function server(existing, agentAfter = "plan") {
    const messages = [
      { type: "user", id: "msg_old", text: "Me llamo Antonio", time: { created: 1 } },
      {
        type: "assistant",
        id: "msg_a0",
        agent: "build",
        model,
        content: [{ type: "text", text: "OK" }],
        time: { created: 2 }
      },
      { type: "idle", id: "msg_i0", outcome: "succeeded", time: { created: 3 } }
    ];
    return (options) => {
      const key = `${options.method} ${options.url}`;
      if (key === "POST /api/session") return { data: existing };
      if (key === "POST /api/session/ses_n8n_chat-1/prompt") {
        messages.push({ type: "user", id: "msg_new", text: "\xBFC\xF3mo me llamo?", time: { created: 4 } });
        messages.push({
          type: "assistant",
          id: "msg_a1",
          agent: agentAfter,
          model,
          finish: "stop",
          content: [{ type: "text", text: "Antonio" }],
          time: { created: 5 }
        });
        messages.push({ type: "idle", id: "msg_i1", outcome: "succeeded", time: { created: 6 } });
        return { data: { id: "msg_new", sessionID: existing.id, type: "user", delivery: "steer", time: { created: 4 } } };
      }
      if (key === "GET /api/session/ses_n8n_chat-1/message") return { data: [...messages].reverse(), cursor: {} };
      if (key === "GET /api/session/ses_n8n_chat-1/permission") return { data: [] };
      return void 0;
    };
  }
  it("reuses the conversation session, switches agent, and returns the reply of this turn only", async () => {
    const existing = sessionInfo({ permissions: [] });
    const { ctx, calls } = fakeContext({ ...baseParameters, agent: "plan" }, server(existing));
    const result = await executeChat(ctx, "sendMessage", 0);
    const create = calls[0];
    assert.equal(create.url, "/api/session");
    assert.equal(create.baseURL, "http://opencode:4096");
    assert.equal(create.body.id, "ses_n8n_chat-1");
    assert.deepEqual(create.body.location, { directory: "/srv/bot" });
    const switched = calls.find((call) => call.url === "/api/session/ses_n8n_chat-1/agent");
    assert.deepEqual(switched?.body, { agent: "plan" });
    const patched = calls.find((call) => call.method === "PATCH");
    assert.ok(patched, "read-only rules replace the empty ruleset");
    assert.equal(result.reply, "Antonio");
    assert.equal(result.agent, "plan");
    assert.equal(result.agentSwitched, true);
    assert.equal(result.status, "succeeded");
    assert.equal(result.sessionId, "ses_n8n_chat-1");
    assert.equal(result.conversationKey, "chat-1");
    assert.equal(typeof result.admittedMs, "number");
    assert.ok(result.admittedMs >= 0);
  });
  it("does not switch agent or patch permissions when they already match", async () => {
    const { presetRules } = await import("../dist/nodes/OpenCode/helpers/permissions.js");
    const existing = sessionInfo({ agent: "build", permissions: presetRules("readOnly") });
    const { ctx, calls } = fakeContext({ ...baseParameters, agent: "build" }, server(existing, "build"));
    const result = await executeChat(ctx, "sendMessage", 0);
    assert.equal(calls.some((call) => call.url.endsWith("/agent")), false);
    assert.equal(calls.some((call) => call.method === "PATCH"), false);
    assert.equal(result.agentSwitched, false);
  });
  it("rejects an empty conversation key", async () => {
    const { ctx } = fakeContext({ ...baseParameters, conversationKey: " " }, () => void 0);
    await assert.rejects(() => executeChat(ctx, "sendMessage", 0), /Conversation Key is empty/);
  });
});
describe("waitForTurn", () => {
  it("rejects pending permissions and gives up at the timeout", async () => {
    let replies = 0;
    const { ctx } = fakeContext({}, (options) => {
      const key = `${options.method} ${options.url}`;
      if (key.endsWith("/message")) {
        return { data: [{ type: "user", id: "msg_u", text: "x", time: { created: 1 } }], cursor: {} };
      }
      if (key.endsWith("/permission")) {
        return replies ? { data: [] } : { data: [{ id: "per_1", sessionID: "s", action: "shell", resources: ["ls"] }] };
      }
      if (key.endsWith("/reply")) {
        replies++;
        assert.equal(options.body.decision, "reject");
        return void 0;
      }
      if (key.endsWith("/wait")) throw Object.assign(new Error("timeout of 100ms exceeded"), { code: "ECONNABORTED" });
      return void 0;
    });
    const outcome = await waitForTurn(ctx, "ses_x", "msg_u", 0, {
      timeoutMs: 50,
      pollIntervalMs: 10,
      autoRejectPermissions: true
    });
    assert.equal(outcome.timedOut, true);
    assert.equal(replies, 1);
    assert.deepEqual(outcome.rejectedPermissions.map((request) => request.id), ["per_1"]);
  });
  it("falls back to polling when the wait route is unavailable", async () => {
    let polls = 0;
    const { ctx, calls } = fakeContext({}, (options) => {
      const key = `${options.method} ${options.url}`;
      if (key.endsWith("/wait")) throw Object.assign(new Error("Not Found"), { httpCode: "404" });
      if (key.endsWith("/message")) {
        polls++;
        const done = polls >= 3 ? [{ type: "idle", id: "msg_i", outcome: "succeeded", time: { created: 2 } }] : [];
        return { data: [...done, { type: "user", id: "msg_u", text: "x", time: { created: 1 } }], cursor: {} };
      }
      return { data: [] };
    });
    const outcome = await waitForTurn(ctx, "ses_x", "msg_u", 0, {
      timeoutMs: 5e3,
      pollIntervalMs: 5,
      autoRejectPermissions: false
    });
    assert.equal(outcome.timedOut, false);
    assert.equal(outcome.turn?.completed, true);
    assert.equal(calls.filter((call) => call.url.endsWith("/wait")).length, 1);
  });
});

describe("node description", () => {
  it("defaults the working directory to a folder that exists everywhere", async () => {
    const { OpenCode } = await import("../dist/nodes/OpenCode/OpenCode.node.js");
    const directories = new OpenCode().description.properties.filter((p) => p.name === "directory");
    assert.ok(directories.length > 0);
    for (const property of directories) assert.equal(property.default, "/tmp");
  });
});

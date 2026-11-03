// Unit tests for the compiled node (dist). Run "npm run build" first; "npm test" does both.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCustomRules, presetRules } from "../dist/nodes/OpenCode/helpers/permissions.js";
import { collectTurn, formatModel, parseModel } from "../dist/nodes/OpenCode/helpers/result.js";
import { resolveSessionId, sessionIdForConversation } from "../dist/nodes/OpenCode/helpers/session-id.js";
describe("sessionIdForConversation", () => {
  it("keeps simple keys readable and stable", () => {
    assert.equal(sessionIdForConversation("chat-42"), "ses_n8n_chat-42");
    assert.equal(sessionIdForConversation("chat-42"), sessionIdForConversation(" chat-42 "));
  });
  it("hashes keys with replaced characters so they cannot collide", () => {
    const a = sessionIdForConversation("a.b");
    const b = sessionIdForConversation("a b");
    assert.notEqual(a, b);
    assert.match(a, /^ses_n8n_a_b_[0-9a-f]{10}$/);
  });
  it("bounds long keys", () => {
    const id = sessionIdForConversation("x".repeat(500));
    assert.ok(id.length <= "ses_n8n_".length + 64);
    assert.match(id, /^ses_n8n_x+_[0-9a-f]{10}$/);
  });
  it("rejects empty keys and passes full session ids through", () => {
    assert.throws(() => sessionIdForConversation("  "));
    assert.equal(resolveSessionId("ses_abc123"), "ses_abc123");
    assert.equal(resolveSessionId("+34 600"), sessionIdForConversation("+34 600"));
  });
});
describe("permission presets", () => {
  const last = (rules, action) => [...rules ?? []].reverse().find((rule) => rule.action === action || rule.action === "*")?.effect;
  it("read-only denies edits and shell, allows reading", () => {
    const rules = presetRules("readOnly");
    assert.equal(last(rules, "edit"), "deny");
    assert.equal(last(rules, "shell"), "deny");
    assert.equal(last(rules, "read"), "allow");
    assert.equal(last(rules, "grep"), "allow");
  });
  it("every unattended preset denies asking the user", () => {
    for (const preset of ["readOnly", "workspaceWrite", "fullAuto"]) {
      assert.equal(last(presetRules(preset), "question"), "deny", preset);
      assert.equal(last(presetRules(preset), "external_directory"), "deny", preset);
    }
  });
  it("workspace write allows edits but not shell", () => {
    const rules = presetRules("workspaceWrite");
    assert.equal(last(rules, "edit"), "allow");
    assert.equal(last(rules, "shell"), "deny");
  });
  it("agent defaults send no rules", () => {
    assert.equal(presetRules("agent"), void 0);
  });
  it("validates custom rules", () => {
    assert.deepEqual(parseCustomRules('[{"action":"read","resource":"*","effect":"allow","x":1}]'), [
      { action: "read", resource: "*", effect: "allow" }
    ]);
    assert.throws(() => parseCustomRules("{"), /valid JSON/);
    assert.throws(() => parseCustomRules("{}"), /array/);
    assert.throws(() => parseCustomRules('[{"action":"read","resource":"*","effect":"maybe"}]'), /rule 0/);
  });
});
describe("models", () => {
  it("parses and formats provider/model#variant", () => {
    assert.deepEqual(parseModel("bifrost/free-first"), { providerID: "bifrost", id: "free-first" });
    assert.deepEqual(parseModel("opencode/pulse#high"), { providerID: "opencode", id: "pulse", variant: "high" });
    assert.equal(formatModel({ providerID: "opencode", id: "pulse", variant: "high" }), "opencode/pulse#high");
    assert.throws(() => parseModel("nomodel"));
    assert.throws(() => parseModel("p/m#"));
  });
});
const model = { providerID: "bifrost", id: "free-first" };
const tokens = (input, output) => ({ input, output, reasoning: 0, cache: { read: 0, write: 0 } });
const timeline = [
  { type: "synthetic", id: "msg_1", time: { created: 1 }, text: "<plugin context>" },
  { type: "user", id: "msg_u1", text: "Me llamo Antonio", time: { created: 2 } },
  {
    type: "assistant",
    id: "msg_a1",
    agent: "build",
    model,
    finish: "tool-calls",
    cost: 1e-3,
    tokens: tokens(100, 10),
    content: [
      { type: "reasoning", text: "thinking" },
      { type: "tool", id: "t1", name: "read", state: { status: "completed" } },
      { type: "tool", id: "t2", name: "shell", state: { status: "error", error: { type: "denied", message: "no" } } }
    ],
    time: { created: 3, completed: 4 }
  },
  {
    type: "assistant",
    id: "msg_a2",
    agent: "build",
    model,
    finish: "stop",
    cost: 2e-3,
    tokens: tokens(200, 20),
    content: [{ type: "text", text: "\n\nOK" }],
    time: { created: 5, completed: 6 }
  },
  { type: "idle", id: "msg_i1", outcome: "succeeded", time: { created: 7 } },
  { type: "agent-switched", id: "msg_s1", time: { created: 8 } },
  { type: "user", id: "msg_u2", text: "\xBFC\xF3mo me llamo?", time: { created: 9 } },
  {
    type: "assistant",
    id: "msg_a3",
    agent: "plan",
    model,
    content: [{ type: "text", text: "Antonio" }],
    time: { created: 10 }
  }
];
describe("collectTurn", () => {
  it("gathers every assistant step of the turn until idle", () => {
    const turn = collectTurn(timeline, "msg_u1");
    assert.ok(turn);
    assert.equal(turn.reply, "OK");
    assert.equal(turn.completed, true);
    assert.equal(turn.outcome, "succeeded");
    assert.equal(turn.agent, "build");
    assert.equal(turn.model, "bifrost/free-first");
    assert.equal(turn.finish, "stop");
    assert.equal(turn.cost, 3e-3);
    assert.deepEqual(turn.tokens, tokens(300, 30));
    assert.deepEqual(turn.toolsUsed, [
      { name: "read", status: "completed" },
      { name: "shell", status: "error", error: "denied: no" }
    ]);
    assert.deepEqual(turn.assistantMessageIds, ["msg_a1", "msg_a2"]);
  });
  it("reports a turn still running and the agent that answers after a switch", () => {
    const turn = collectTurn(timeline, "msg_u2");
    assert.ok(turn);
    assert.equal(turn.completed, false);
    assert.equal(turn.agent, "plan");
    assert.equal(turn.reply, "Antonio");
  });
  it("stops at the next user message even without idle", () => {
    const withoutIdle = timeline.filter((message) => message.type !== "idle");
    const turn = collectTurn(withoutIdle, "msg_u1");
    assert.equal(turn?.completed, false);
    assert.equal(turn?.reply, "OK");
  });
  it("returns undefined for unknown messages", () => {
    assert.equal(collectTurn(timeline, "msg_missing"), void 0);
  });
});

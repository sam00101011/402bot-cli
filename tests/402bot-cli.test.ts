import { describe, expect, test } from "bun:test";

import {
  buildProxyInvocation,
  buildUsage,
  DEFAULT_API_BASE_URL,
  DEFAULT_MCP_URL,
} from "../index.js";

describe("402bot CLI wrapper", () => {
  test("prints help with no args", () => {
    const invocation = buildProxyInvocation([]);
    expect(invocation.type).toBe("help");
    if (invocation.type === "help") {
      expect(invocation.text).toContain("Usage: 402bot <command> [options]");
    }
  });

  test("forwards wallet commands to x402-proxy", () => {
    expect(buildProxyInvocation(["wallet", "history"])).toEqual({
      type: "proxy",
      proxyArgs: ["wallet", "history"],
    });
  });

  test("routes mcp to the 402.bot MCP server", () => {
    expect(buildProxyInvocation(["mcp"])).toEqual({
      type: "proxy",
      proxyArgs: ["mcp", DEFAULT_MCP_URL],
    });
  });

  test("adds campaign attribution to mcp", () => {
    expect(buildProxyInvocation(["mcp", "--campaign-id", "codex-mcp-setup"])).toEqual({
      type: "proxy",
      proxyArgs: ["mcp", `${DEFAULT_MCP_URL}?campaignId=codex-mcp-setup`],
    });
  });

  test("maps route to the paid route API", () => {
    expect(buildProxyInvocation(["route", "--body", '{"goal":"weather"}'])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"goal":"weather"}',
        `${DEFAULT_API_BASE_URL}/v1/route`,
      ],
    });
  });

  test("does not duplicate content-type headers", () => {
    expect(
      buildProxyInvocation([
        "materialize",
        "--header",
        "Content-Type: application/json",
        "--body",
        "{}",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        "{}",
        `${DEFAULT_API_BASE_URL}/v1/alchemist/materialize`,
      ],
    });
  });

  test("builds recipe run URLs", () => {
    expect(buildProxyInvocation(["recipe", "run", "wallet-intel-brief", "--body", "{}"])).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        "{}",
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });
  });

  test("builds polymarket performance URLs", () => {
    expect(buildProxyInvocation(["polymarket", "performance", "0xabc"])).toEqual({
      type: "proxy",
      proxyArgs: [`${DEFAULT_API_BASE_URL}/analytics/predictions/polymarket/0xabc`],
    });
  });

  test("supports env overrides for public surfaces", () => {
    expect(
      buildProxyInvocation(["fetch-sources"], {
        BOT402_API_URL: "https://staging.api.402.bot",
      }),
    ).toEqual({
      type: "proxy",
      proxyArgs: ["https://staging.api.402.bot/v1/alchemist/fetch-sources"],
    });
  });

  test("returns a targeted error for missing recipe slug", () => {
    expect(buildProxyInvocation(["recipe", "run"])).toEqual({
      type: "error",
      message: "recipe run requires a <slug>.",
    });
  });

  test("usage documents the main 402bot flows", () => {
    const usage = buildUsage();
    expect(usage).toContain("402bot mcp --campaign-id defi-agent-alpha");
    expect(usage).toContain("wallet-intelligence or risk API");
    expect(usage).toContain("402bot recipe run wallet-intel-brief");
  });
});

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildProxyInvocation,
  buildUsage,
  DEFAULT_API_BASE_URL,
  DEFAULT_MCP_URL,
  DEFAULT_NETWORK,
  isEntrypoint,
} from "../index.js";

describe("402bot CLI wrapper", () => {
  test("prints help with no args", () => {
    const invocation = buildProxyInvocation([]);
    expect(invocation.type).toBe("help");
    if (invocation.type === "help") {
      expect(invocation.text).toContain("Usage: 402bot <command> [options]");
    }
  });

  test("treats a symlinked global bin as the entrypoint", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "402bot-entrypoint-"));
    const symlinkPath = join(tempDir, "402bot");

    try {
      symlinkSync(join(process.cwd(), "index.js"), symlinkPath);
      expect(isEntrypoint(["node", symlinkPath])).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("forwards wallet history to x402-proxy", () => {
    expect(buildProxyInvocation(["wallet", "history"])).toEqual({
      type: "proxy",
      proxyArgs: ["wallet", "history"],
    });
  });

  test("maps wallet dossier to the wallet-intel recipe wrapper", () => {
    expect(
      buildProxyInvocation(["wallet", "dossier", "0xabc"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });
  });

  test("supports the polymarket wallet dossier profile", () => {
    expect(
      buildProxyInvocation(["wallet", "dossier", "0xabc", "--profile", "polymarket", "--days", "14"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc","days":14}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/polymarket-wallet-dossier/run`,
      ],
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
    expect(
      buildProxyInvocation(["route", "--body", '{"goal":"weather"}']),
    ).toEqual({
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

  test("builds discover goal requests over the public HTTP API", () => {
    expect(
      buildProxyInvocation(["discover", "find", "the", "best", "wallet", "risk", "API", "--limit", "7", "--budget", "0.02"]),
    ).toEqual({
      type: "http",
      method: "POST",
      format: "discover",
      meta: {
        goal: "find the best wallet risk API",
      },
      jsonBody: {
        goal: "find the best wallet risk API",
        network: DEFAULT_NETWORK,
        strategy: "balanced",
        limit: 7,
        budgetUsdc: 0.02,
      },
      url: `${DEFAULT_API_BASE_URL}/v1/discover/goal`,
    });
  });

  test("supports --json on discovery and inspection commands", () => {
    expect(
      buildProxyInvocation(["--json", "discover", "find", "the", "best", "wallet", "risk", "API"]),
    ).toEqual({
      type: "http",
      method: "POST",
      format: "discover",
      jsonOutput: true,
      meta: {
        goal: "find the best wallet risk API",
      },
      jsonBody: {
        goal: "find the best wallet risk API",
        network: DEFAULT_NETWORK,
        strategy: "balanced",
        limit: 5,
      },
      url: `${DEFAULT_API_BASE_URL}/v1/discover/goal`,
    });

    expect(
      buildProxyInvocation(["inspect", "weather-alpha", "--json"]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "inspect_endpoint",
      jsonOutput: true,
      meta: {
        target: "weather-alpha",
      },
      url: `${DEFAULT_API_BASE_URL}/analytics/endpoint/weather-alpha?days=30`,
    });
  });

  test("builds endpoint inspection requests", () => {
    expect(
      buildProxyInvocation(["inspect", "weather-alpha", "--days", "14"]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "inspect_endpoint",
      meta: {
        target: "weather-alpha",
      },
      url: `${DEFAULT_API_BASE_URL}/analytics/endpoint/weather-alpha?days=14`,
    });
  });

  test("builds agent inspection requests for wallet addresses", () => {
    expect(
      buildProxyInvocation([
        "inspect",
        "0x1111111111111111111111111111111111111111",
        "--days",
        "7",
        "--network",
        "eip155:8453",
      ]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "inspect_agent",
      meta: {
        target: "0x1111111111111111111111111111111111111111",
      },
      url:
        `${DEFAULT_API_BASE_URL}/analytics/agent/0x1111111111111111111111111111111111111111?days=7&network=eip155%3A8453`,
    });
  });

  test("builds compare goal plans as a local action", () => {
    expect(
      buildProxyInvocation(["compare", "wallet", "intelligence", "--days", "21"]),
    ).toEqual({
      type: "local",
      action: "compare_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "wallet intelligence",
      network: DEFAULT_NETWORK,
      strategy: "balanced",
      limit: 3,
      budgetUsdc: undefined,
      days: 21,
    });
  });

  test("builds prompt and plan as local actions", () => {
    expect(
      buildProxyInvocation(["prompt", "find", "a", "wallet", "risk", "API"]),
    ).toEqual({
      type: "local",
      action: "prompt_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "find a wallet risk API",
      network: DEFAULT_NETWORK,
      strategy: "balanced",
      limit: 5,
      budgetUsdc: undefined,
    });

    expect(
      buildProxyInvocation(["plan", "monitor", "this", "wallet", "for", "treasury", "risk"]),
    ).toEqual({
      type: "local",
      action: "plan_goal",
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "monitor this wallet for treasury risk",
      network: DEFAULT_NETWORK,
      strategy: "balanced",
      limit: 3,
      budgetUsdc: undefined,
      days: 30,
    });
  });

  test("lists and searches recipes over the public recipe directory", () => {
    expect(
      buildProxyInvocation(["recipe", "list", "--cluster", "Wallet Intelligence", "--limit", "20"]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "recipes",
      meta: {
        mode: "list",
      },
      url:
        `${DEFAULT_API_BASE_URL}/v1/recipes?limit=20&cluster=Wallet+Intelligence&sort=quality`,
    });

    expect(
      buildProxyInvocation(["recipe", "search", "polymarket", "--max-price", "0.02"]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "recipes",
      meta: {
        mode: "search",
        query: "polymarket",
      },
      url:
        `${DEFAULT_API_BASE_URL}/v1/recipes/search?q=polymarket&limit=12&sort=quality&maxPriceUsdc=0.02`,
    });
  });

  test("supports --json on local plan and recipe search commands", () => {
    expect(
      buildProxyInvocation(["plan", "monitor", "this", "wallet", "for", "treasury", "risk", "--json"]),
    ).toEqual({
      type: "local",
      action: "plan_goal",
      jsonOutput: true,
      baseUrl: DEFAULT_API_BASE_URL,
      goal: "monitor this wallet for treasury risk",
      network: DEFAULT_NETWORK,
      strategy: "balanced",
      limit: 3,
      budgetUsdc: undefined,
      days: 30,
    });

    expect(
      buildProxyInvocation(["recipe", "search", "polymarket", "--max-price", "0.02", "--json"]),
    ).toEqual({
      type: "http",
      method: "GET",
      format: "recipes",
      jsonOutput: true,
      meta: {
        mode: "search",
        query: "polymarket",
      },
      url:
        `${DEFAULT_API_BASE_URL}/v1/recipes/search?q=polymarket&limit=12&sort=quality&maxPriceUsdc=0.02`,
    });
  });

  test("keeps recipe run as a direct proxy-backed paid surface", () => {
    expect(
      buildProxyInvocation(["recipe", "run", "wallet-intel-brief", "--body", '{"input":{"walletAddress":"0xabc"}}']),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });
  });

  test("wraps docs crawl as a cloudflare_crawl fetch-transform", () => {
    expect(
      buildProxyInvocation(["docs", "crawl", "https://docs.uniswap.org"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"sourceId":"cloudflare_crawl","params":{"url":"https://docs.uniswap.org"}}',
        `${DEFAULT_API_BASE_URL}/v1/alchemist/fetch-transform`,
      ],
    });
  });

  test("wraps polymarket trading into the paid order API", () => {
    expect(
      buildProxyInvocation(["trade", "polymarket", "12345", "--side", "buy", "--size", "5", "--kind", "limit", "--price", "0.42"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"tokenId":"12345","side":"BUY","orderKind":"limit","price":0.42,"size":5}',
        `${DEFAULT_API_BASE_URL}/v1/predictions/polymarket/orders`,
      ],
    });
  });

  test("prints init agent snippets for Codex", () => {
    const invocation = buildProxyInvocation(["init", "agent", "codex", "--campaign-id", "codex-mcp-setup"]);
    expect(invocation.type).toBe("print");
    if (invocation.type === "print") {
      expect(invocation.text).toContain("BOT402_CAMPAIGN_ID=codex-mcp-setup");
      expect(invocation.text).toContain("codex mcp add 402bot --url https://api.402.bot/mcp?campaignId=codex-mcp-setup");
      expect(invocation.text).toContain("[mcp_servers.402bot]");
    }
  });

  test("supports --json on init agent output", () => {
    const invocation = buildProxyInvocation(["init", "agent", "codex", "--campaign-id", "codex-mcp-setup", "--json"]);
    expect(invocation.type).toBe("print");
    if (invocation.type === "print") {
      expect(invocation.jsonOutput).toBe(true);
      expect(invocation.data).toMatchObject({
        campaignId: "codex-mcp-setup",
        remoteMcpUrl: "https://api.402.bot/mcp?campaignId=codex-mcp-setup",
        envDefaults: {
          BOT402_CAMPAIGN_ID: "codex-mcp-setup",
        },
        clients: [
          {
            id: "codex",
          },
        ],
      });
    }
  });

  test("maps named workflows to recipe runs", () => {
    expect(
      buildProxyInvocation(["run", "wallet-research", "0xabc"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"walletAddress":"0xabc"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/wallet-intel-brief/run`,
      ],
    });

    expect(
      buildProxyInvocation([
        "run",
        "protocol-diligence",
        "https://docs.uniswap.org",
        "--question",
        "What are the obvious diligence gaps?",
      ]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"url":"https://docs.uniswap.org","question":"What are the obvious diligence gaps?"}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/site-due-diligence-pack/run`,
      ],
    });

    expect(
      buildProxyInvocation(["run", "market-briefing", "Polymarket", "election", "odds", "--min-likes", "5"]),
    ).toEqual({
      type: "proxy",
      proxyArgs: [
        "--method",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--body",
        '{"input":{"query":"Polymarket election odds","minLikes":5}}',
        `${DEFAULT_API_BASE_URL}/v1/recipes/prediction-market-topic-radar/run`,
      ],
    });
  });

  test("supports env overrides for raw public surfaces", () => {
    expect(
      buildProxyInvocation(["fetch-sources"], {
        BOT402_API_URL: "https://staging.api.402.bot",
      }),
    ).toEqual({
      type: "proxy",
      proxyArgs: ["https://staging.api.402.bot/v1/alchemist/fetch-sources"],
    });
  });

  test("returns targeted errors for malformed higher-level commands", () => {
    expect(buildProxyInvocation(["recipe", "run"])).toEqual({
      type: "error",
      message: "recipe run requires a <slug>.",
    });

    expect(buildProxyInvocation(["trade", "polymarket", "12345", "--size", "1"])).toEqual({
      type: "error",
      message: "trade polymarket requires --side buy|sell.",
    });
  });

  test("usage documents the new agent and DeFi flows", () => {
    const usage = buildUsage();
    expect(usage).toContain("402bot discover");
    expect(usage).toContain("402bot inspect <endpoint-id-or-agent-address>");
    expect(usage).toContain("402bot wallet dossier <address>");
    expect(usage).toContain("402bot trade polymarket 12345 --side buy --size 5");
    expect(usage).toContain("402bot init agent codex --campaign-id codex-mcp-setup");
  });
});

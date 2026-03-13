#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const DEFAULT_API_BASE_URL = "https://api.402.bot";
export const DEFAULT_MCP_URL = "https://api.402.bot/mcp";
export const DEFAULT_NETWORK = "eip155:8453";

const DEFAULT_DISCOVER_LIMIT = 5;
const DEFAULT_COMPARE_LIMIT = 3;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_RECIPE_LIMIT = 12;
const DEFAULT_RECIPE_SORT = "quality";
const DEFAULT_CRAWL_SOURCE = "cloudflare_crawl";
const DEFAULT_POLYMARKET_PROFILE_DAYS = 30;
const DEFAULT_PROTOCOL_DILIGENCE_QUESTION =
  "What kind of site is this and what diligence gaps are obvious from public evidence?";
const INIT_AGENT_FIRST_PROMPT =
  "Find the best live Base wallet-intelligence or risk API for an autonomous trading agent, show me the top 3 candidates, and tell me the exact next MCP call to make.";

const HTTP_SURFACES = {
  route: { method: "POST", path: "/v1/route" },
  "route-probe": { method: "POST", path: "/v1/route/probe" },
  transform: { method: "POST", path: "/v1/alchemist/transform" },
  "fetch-transform": { method: "POST", path: "/v1/alchemist/fetch-transform" },
  "fetch-sources": { method: "GET", path: "/v1/alchemist/fetch-sources" },
  materialize: { method: "POST", path: "/v1/alchemist/materialize" },
  recipes: { method: "GET", path: "/v1/recipes" },
};

const GOAL_OPTION_SPECS = [
  {
    flags: ["--network"],
    key: "network",
  },
  {
    flags: ["--strategy"],
    key: "strategy",
    parse: parseStrategyValue,
  },
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--budget", "--budget-usdc"],
    key: "budgetUsdc",
    parse: parsePositiveNumberValue,
  },
];

const LOOKBACK_OPTION_SPECS = [
  {
    flags: ["--days"],
    key: "days",
    parse: parsePositiveIntValue,
  },
];

const RECIPE_DIRECTORY_OPTION_SPECS = [
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--cluster"],
    key: "cluster",
  },
  {
    flags: ["--capability"],
    key: "capability",
  },
  {
    flags: ["--sort"],
    key: "sort",
    parse: parseRecipeSortValue,
  },
  {
    flags: ["--owner"],
    key: "owner",
  },
  {
    flags: ["--max-price", "--max-price-usdc"],
    key: "maxPriceUsdc",
    parse: parsePositiveNumberValue,
  },
];

const TRADE_POLYMARKET_OPTION_SPECS = [
  {
    flags: ["--side"],
    key: "side",
    parse: parsePolymarketSideValue,
  },
  {
    flags: ["--size"],
    key: "size",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--amount"],
    key: "amount",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--price"],
    key: "price",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--kind", "--order-kind"],
    key: "orderKind",
    parse: parsePolymarketOrderKindValue,
  },
  {
    flags: ["--time-in-force"],
    key: "timeInForce",
    parse: parsePolymarketTimeInForceValue,
  },
  {
    flags: ["--post-only"],
    key: "postOnly",
    type: "boolean",
  },
];

const INIT_AGENT_OPTION_SPECS = [
  {
    flags: ["--campaign-id"],
    key: "campaignId",
  },
];

const WALLET_DOSSIER_OPTION_SPECS = [
  {
    flags: ["--profile"],
    key: "profile",
    parse: parseWalletProfileValue,
  },
  {
    flags: ["--days"],
    key: "days",
    parse: parsePositiveIntValue,
  },
];

const PROTOCOL_DILIGENCE_OPTION_SPECS = [
  {
    flags: ["--question"],
    key: "question",
  },
  {
    flags: ["--depth"],
    key: "depth",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
];

const MARKET_BRIEFING_OPTION_SPECS = [
  {
    flags: ["--min-likes"],
    key: "minLikes",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--min-replies"],
    key: "minReplies",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--hashtags"],
    key: "hashtags",
  },
];

function apiBaseUrl(env = process.env) {
  return env.BOT402_API_URL || DEFAULT_API_BASE_URL;
}

function mcpBaseUrl(env = process.env) {
  return env.BOT402_MCP_URL || DEFAULT_MCP_URL;
}

function buildRemoteMcpUrl(remoteUrl, campaignId) {
  const url = new URL(remoteUrl);
  if (campaignId) {
    url.searchParams.set("campaignId", campaignId);
  }
  return url.toString();
}

function extractGlobalCliOptions(argv) {
  const args = [];
  let jsonOutput = false;

  for (const arg of argv) {
    if (arg === "--json" || arg === "--json=true") {
      jsonOutput = true;
      continue;
    }
    if (arg === "--json=false") {
      continue;
    }
    args.push(arg);
  }

  return {
    args,
    jsonOutput,
  };
}

function withJsonOutput(invocation, jsonOutput) {
  if (!jsonOutput) {
    return invocation;
  }

  if (invocation.type === "http" || invocation.type === "local" || invocation.type === "print") {
    return {
      ...invocation,
      jsonOutput: true,
    };
  }

  return invocation;
}

function isHelpFlag(value) {
  return value === "--help" || value === "-h" || value === "help";
}

function normalizeProxyFetchArgs(args) {
  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-d") {
      normalized.push("--body");
      continue;
    }
    if (arg.startsWith("-d=")) {
      normalized.push(`--body=${arg.slice(3)}`);
      continue;
    }
    if (arg === "-H") {
      normalized.push("--header");
      continue;
    }
    if (arg.startsWith("-H=")) {
      normalized.push(`--header=${arg.slice(3)}`);
      continue;
    }
    normalized.push(arg);
  }
  return normalized;
}

function parseRepeatedFlagValues(args, flagName) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flagName) {
      const value = args[index + 1];
      if (value !== undefined) {
        values.push(value);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith(`${flagName}=`)) {
      values.push(arg.slice(flagName.length + 1));
    }
  }
  return values;
}

function hasBodyArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--body") {
      return args[index + 1] !== undefined;
    }
    if (arg.startsWith("--body=")) {
      return true;
    }
  }
  return false;
}

function hasContentTypeHeader(args) {
  const headers = parseRepeatedFlagValues(args, "--header");
  return headers.some((header) => {
    const [name] = header.split(":", 1);
    return name?.trim().toLowerCase() === "content-type";
  });
}

function buildFetchInvocation(url, method, args) {
  const normalizedArgs = normalizeProxyFetchArgs(args);
  const proxyArgs = [];

  if (method !== "GET") {
    proxyArgs.push("--method", method);
  }
  if (method !== "GET" && hasBodyArg(normalizedArgs) && !hasContentTypeHeader(normalizedArgs)) {
    proxyArgs.push("--header", "Content-Type: application/json");
  }

  proxyArgs.push(...normalizedArgs, url);
  return { type: "proxy", proxyArgs };
}

function buildJsonFetchInvocation(url, method, body) {
  return buildFetchInvocation(url, method, ["--body", JSON.stringify(body)]);
}

function buildHttpInvocation(url, method, format, meta = {}, jsonBody) {
  return {
    type: "http",
    url,
    method,
    format,
    meta,
    ...(jsonBody === undefined ? {} : { jsonBody }),
  };
}

function buildMcpInvocation(args, env = process.env) {
  if (args.some(isHelpFlag)) {
    return { type: "help", text: buildUsage() };
  }

  let remoteUrl = mcpBaseUrl(env);
  let campaignId;
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--campaign-id") {
      const value = args[index + 1];
      if (!value) {
        return { type: "error", message: "--campaign-id requires a value." };
      }
      campaignId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--campaign-id=")) {
      campaignId = arg.slice("--campaign-id=".length);
      continue;
    }
    if (arg === "--url") {
      const value = args[index + 1];
      if (!value) {
        return { type: "error", message: "--url requires a value." };
      }
      remoteUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--url=")) {
      remoteUrl = arg.slice("--url=".length);
      continue;
    }
    passthrough.push(arg);
  }

  return {
    type: "proxy",
    proxyArgs: ["mcp", ...passthrough, buildRemoteMcpUrl(remoteUrl, campaignId)],
  };
}

function buildDiscoverInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, GOAL_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return { type: "error", message: 'Usage: 402bot discover "<goal>" [--network ...] [--strategy ...] [--limit ...] [--budget ...]' };
  }

  return withJsonOutput(buildHttpInvocation(
    `${apiBaseUrl(env)}/v1/discover/goal`,
    "POST",
    "discover",
    { goal },
    {
      goal,
      network: parsed.options.network ?? DEFAULT_NETWORK,
      strategy: parsed.options.strategy ?? "balanced",
      limit: parsed.options.limit ?? DEFAULT_DISCOVER_LIMIT,
      ...(parsed.options.budgetUsdc === undefined ? {} : { budgetUsdc: parsed.options.budgetUsdc }),
    },
  ), cliOptions.jsonOutput);
}

function buildInspectInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, LOOKBACK_OPTION_SPECS.concat([
    {
      flags: ["--network"],
      key: "network",
    },
  ]));
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  if (parsed.positionals.length !== 1) {
    return { type: "error", message: "Usage: 402bot inspect <endpoint-id-or-agent-address> [--days 30] [--network eip155:8453]" };
  }

  const rawTarget = parsed.positionals[0];
  const days = parsed.options.days ?? DEFAULT_LOOKBACK_DAYS;
  const normalizedAgent = normalizeAgentTarget(rawTarget);

  if (normalizedAgent) {
    return withJsonOutput(buildHttpInvocation(
      buildUrlWithQuery(`${apiBaseUrl(env)}/analytics/agent/${encodeURIComponent(normalizedAgent)}`, {
        days,
        ...(parsed.options.network ? { network: parsed.options.network } : {}),
      }),
      "GET",
      "inspect_agent",
      { target: normalizedAgent },
    ), cliOptions.jsonOutput);
  }

  const endpointId = normalizeEndpointTarget(rawTarget);
  return withJsonOutput(buildHttpInvocation(
    buildUrlWithQuery(`${apiBaseUrl(env)}/analytics/endpoint/${encodeURIComponent(endpointId)}`, {
      days,
    }),
    "GET",
    "inspect_endpoint",
    { target: endpointId },
  ), cliOptions.jsonOutput);
}

function buildCompareInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, GOAL_OPTION_SPECS.concat(LOOKBACK_OPTION_SPECS));
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return { type: "error", message: 'Usage: 402bot compare "<goal>" [--network ...] [--strategy ...] [--limit ...] [--budget ...] [--days 30]' };
  }

  return withJsonOutput({
    type: "local",
    action: "compare_goal",
    baseUrl: apiBaseUrl(env),
    goal,
    network: parsed.options.network ?? DEFAULT_NETWORK,
    strategy: parsed.options.strategy ?? "balanced",
    limit: parsed.options.limit ?? DEFAULT_COMPARE_LIMIT,
    budgetUsdc: parsed.options.budgetUsdc,
    days: parsed.options.days ?? DEFAULT_LOOKBACK_DAYS,
  }, cliOptions.jsonOutput);
}

function buildPromptInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, GOAL_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return { type: "error", message: 'Usage: 402bot prompt "<goal>" [--network ...] [--strategy ...] [--limit ...] [--budget ...]' };
  }

  return withJsonOutput({
    type: "local",
    action: "prompt_goal",
    baseUrl: apiBaseUrl(env),
    goal,
    network: parsed.options.network ?? DEFAULT_NETWORK,
    strategy: parsed.options.strategy ?? "balanced",
    limit: parsed.options.limit ?? DEFAULT_DISCOVER_LIMIT,
    budgetUsdc: parsed.options.budgetUsdc,
  }, cliOptions.jsonOutput);
}

function buildPlanInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, GOAL_OPTION_SPECS.concat(LOOKBACK_OPTION_SPECS));
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return { type: "error", message: 'Usage: 402bot plan "<task>" [--network ...] [--strategy ...] [--limit ...] [--budget ...] [--days 30]' };
  }

  return withJsonOutput({
    type: "local",
    action: "plan_goal",
    baseUrl: apiBaseUrl(env),
    goal,
    network: parsed.options.network ?? DEFAULT_NETWORK,
    strategy: parsed.options.strategy ?? "balanced",
    limit: parsed.options.limit ?? DEFAULT_COMPARE_LIMIT,
    budgetUsdc: parsed.options.budgetUsdc,
    days: parsed.options.days ?? DEFAULT_LOOKBACK_DAYS,
  }, cliOptions.jsonOutput);
}

function buildRecipeInvocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;

  if (action === "run") {
    const [slug, ...forwarded] = rest;
    if (!slug || slug.startsWith("-")) {
      return { type: "error", message: "recipe run requires a <slug>." };
    }
    return buildFetchInvocation(
      `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}/run`,
      "POST",
      forwarded,
    );
  }

  if (action === "list") {
    const parsed = parseOptionArgs(rest, RECIPE_DIRECTORY_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length > 0) {
      return { type: "error", message: "recipe list does not take positional arguments." };
    }

    return withJsonOutput(buildHttpInvocation(
      buildUrlWithQuery(`${apiBaseUrl(env)}/v1/recipes`, {
        limit: parsed.options.limit ?? DEFAULT_RECIPE_LIMIT,
        cluster: parsed.options.cluster,
        capability: parsed.options.capability,
        sort: parsed.options.sort ?? DEFAULT_RECIPE_SORT,
        owner: parsed.options.owner,
        maxPriceUsdc: parsed.options.maxPriceUsdc,
      }),
      "GET",
      "recipes",
      { mode: "list" },
    ), cliOptions.jsonOutput);
  }

  if (action === "search") {
    const parsed = parseOptionArgs(rest, RECIPE_DIRECTORY_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const query = joinPositionals(parsed.positionals);
    if (!query) {
      return { type: "error", message: 'Usage: 402bot recipe search "<query>" [--cluster ...] [--capability ...] [--limit ...] [--max-price ...]' };
    }

    return withJsonOutput(buildHttpInvocation(
      buildUrlWithQuery(`${apiBaseUrl(env)}/v1/recipes/search`, {
        q: query,
        limit: parsed.options.limit ?? DEFAULT_RECIPE_LIMIT,
        cluster: parsed.options.cluster,
        capability: parsed.options.capability,
        sort: parsed.options.sort ?? DEFAULT_RECIPE_SORT,
        owner: parsed.options.owner,
        maxPriceUsdc: parsed.options.maxPriceUsdc,
      }),
      "GET",
      "recipes",
      { mode: "search", query },
    ), cliOptions.jsonOutput);
  }

  return {
    type: "error",
    message: "Usage: 402bot recipe <run|list|search> ...",
  };
}

function buildWalletInvocation(args, env = process.env) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "dossier") {
    return { type: "proxy", proxyArgs: ["wallet", ...args] };
  }

  const parsed = parseOptionArgs(rest, WALLET_DOSSIER_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return { type: "error", message: "Usage: 402bot wallet dossier <address> [--profile wallet|polymarket] [--days 30]" };
  }

  const address = parsed.positionals[0];
  const profile = parsed.options.profile ?? "wallet";
  if (profile === "polymarket") {
    return buildRecipeRunFromInput(
      "polymarket-wallet-dossier",
      {
        walletAddress: address,
        days: parsed.options.days ?? DEFAULT_POLYMARKET_PROFILE_DAYS,
      },
      env,
    );
  }

  return buildRecipeRunFromInput(
    "wallet-intel-brief",
    {
      walletAddress: address,
    },
    env,
  );
}

function buildDocsInvocation(args, env = process.env) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "crawl") {
    return { type: "error", message: "Usage: 402bot docs crawl <url>" };
  }

  if (rest.length !== 1) {
    return { type: "error", message: "docs crawl requires exactly one URL." };
  }

  return buildJsonFetchInvocation(
    `${apiBaseUrl(env)}/v1/alchemist/fetch-transform`,
    "POST",
    {
      sourceId: DEFAULT_CRAWL_SOURCE,
      params: {
        url: rest[0],
      },
    },
  );
}

function buildTradeInvocation(args, env = process.env) {
  const [surface, ...rest] = args;
  if (surface !== "polymarket") {
    return { type: "error", message: "Usage: 402bot trade polymarket <market-or-token-id> --side buy|sell --size 1 [--kind market|limit] [--price ...]" };
  }

  const parsed = parseOptionArgs(rest, TRADE_POLYMARKET_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return { type: "error", message: "trade polymarket requires one <market-or-token-id> positional value." };
  }
  if (!parsed.options.side) {
    return { type: "error", message: "trade polymarket requires --side buy|sell." };
  }
  if (parsed.options.size === undefined && parsed.options.amount === undefined) {
    return { type: "error", message: "trade polymarket requires either --size or --amount." };
  }

  const orderKind = parsed.options.orderKind ?? "market";
  if (orderKind === "limit" && parsed.options.price === undefined) {
    return { type: "error", message: "limit orders require --price." };
  }

  return buildJsonFetchInvocation(
    `${apiBaseUrl(env)}/v1/predictions/polymarket/orders`,
    "POST",
    {
      tokenId: parsed.positionals[0],
      side: parsed.options.side,
      orderKind,
      ...(parsed.options.price === undefined ? {} : { price: parsed.options.price }),
      ...(parsed.options.size === undefined ? {} : { size: parsed.options.size }),
      ...(parsed.options.amount === undefined ? {} : { amount: parsed.options.amount }),
      ...(parsed.options.timeInForce === undefined ? {} : { timeInForce: parsed.options.timeInForce }),
      ...(parsed.options.postOnly ? { postOnly: true } : {}),
    },
  );
}

function buildPolymarketInvocation(args, env = process.env) {
  const [action, value, ...rest] = args;
  switch (action) {
    case "order":
      return buildFetchInvocation(
        `${apiBaseUrl(env)}/v1/predictions/polymarket/orders`,
        "POST",
        value ? [value, ...rest] : rest,
      );
    case "performance":
      if (!value || value.startsWith("-")) {
        return {
          type: "error",
          message: "polymarket performance requires an address.",
        };
      }
      return buildFetchInvocation(
        `${apiBaseUrl(env)}/analytics/predictions/polymarket/${encodeURIComponent(value)}`,
        "GET",
        rest,
      );
    default:
      return {
        type: "error",
        message:
          "Usage: 402bot polymarket <order|performance> ...",
      };
  }
}

function buildInitInvocation(args, env = process.env, cliOptions = {}) {
  const [target, ...rest] = args;
  if (target !== "agent") {
    return { type: "error", message: "Usage: 402bot init agent [claude|claude-code|cursor|codex|gemini|all] [--campaign-id ...]" };
  }

  const parsed = parseOptionArgs(rest, INIT_AGENT_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const client = parsed.positionals[0] ?? "all";
  if (!["all", "claude", "claude-code", "cursor", "codex", "gemini"].includes(client)) {
    return { type: "error", message: `Unknown init agent target: ${client}` };
  }

  const payload = buildInitAgentPayload({
    client,
    campaignId: parsed.options.campaignId,
    env,
  });

  return withJsonOutput({
    type: "print",
    text: buildInitAgentText(payload),
    data: payload,
  }, cliOptions.jsonOutput);
}

function buildRunInvocation(args, env = process.env) {
  const [workflow, ...rest] = args;
  if (!workflow) {
    return { type: "error", message: "Usage: 402bot run <wallet-research|protocol-diligence|market-briefing> ..." };
  }

  if (workflow === "wallet-research") {
    if (rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot run wallet-research <address>" };
    }
    return buildRecipeRunFromInput(
      "wallet-intel-brief",
      {
        walletAddress: rest[0],
      },
      env,
    );
  }

  if (workflow === "protocol-diligence") {
    const parsed = parseOptionArgs(rest, PROTOCOL_DILIGENCE_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 1) {
      return { type: "error", message: "Usage: 402bot run protocol-diligence <url> [--question ...] [--depth ...] [--limit ...]" };
    }

    return buildRecipeRunFromInput(
      "site-due-diligence-pack",
      {
        url: parsed.positionals[0],
        question: parsed.options.question ?? DEFAULT_PROTOCOL_DILIGENCE_QUESTION,
        ...(parsed.options.depth === undefined ? {} : { depth: parsed.options.depth }),
        ...(parsed.options.limit === undefined ? {} : { limit: parsed.options.limit }),
      },
      env,
    );
  }

  if (workflow === "market-briefing") {
    const parsed = parseOptionArgs(rest, MARKET_BRIEFING_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const query = joinPositionals(parsed.positionals);
    if (!query) {
      return { type: "error", message: 'Usage: 402bot run market-briefing "<topic>" [--min-likes ...] [--min-replies ...] [--hashtags ...]' };
    }

    return buildRecipeRunFromInput(
      "prediction-market-topic-radar",
      {
        query,
        ...(parsed.options.minLikes === undefined ? {} : { minLikes: parsed.options.minLikes }),
        ...(parsed.options.minReplies === undefined ? {} : { minReplies: parsed.options.minReplies }),
        ...(parsed.options.hashtags === undefined ? {} : { hashtags: parsed.options.hashtags }),
      },
      env,
    );
  }

  return {
    type: "error",
    message: `Unknown workflow: ${workflow}\nSupported workflows: wallet-research, protocol-diligence, market-briefing`,
  };
}

function buildRecipeRunFromInput(slug, input, env = process.env) {
  return buildJsonFetchInvocation(
    `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}/run`,
    "POST",
    {
      input,
    },
  );
}

function buildInitAgentPayload({ client, campaignId, env = process.env }) {
  const remoteUrl = buildRemoteMcpUrl(mcpBaseUrl(env), campaignId);
  const campaignLabel = campaignId ?? "<your-campaign-id>";
  const snippets = {
    claude: {
      id: "claude",
      title: "Claude Desktop",
      body: JSON.stringify({
        mcpServers: {
          "402bot": {
            type: "http",
            url: remoteUrl,
          },
        },
      }, null, 2),
    },
    "claude-code": {
      id: "claude-code",
      title: "Claude Code",
      body: `claude mcp add-json 402bot '${JSON.stringify({
        type: "http",
        url: remoteUrl,
      })}'`,
    },
    cursor: {
      id: "cursor",
      title: "Cursor",
      body: JSON.stringify({
        mcpServers: {
          "402bot": {
            url: remoteUrl,
          },
        },
      }, null, 2),
    },
    codex: {
      id: "codex",
      title: "Codex CLI",
      body: [
        `codex mcp add 402bot --url ${remoteUrl}`,
        "",
        "[mcp_servers.402bot]",
        `url = "${remoteUrl}"`,
      ].join("\n"),
    },
    gemini: {
      id: "gemini",
      title: "Gemini CLI",
      body: JSON.stringify({
        mcpServers: {
          "402bot": {
            httpUrl: remoteUrl,
            timeout: 20000,
          },
        },
      }, null, 2),
    },
  };

  const selectedTargets = client === "all"
    ? ["claude", "claude-code", "cursor", "codex", "gemini"]
    : [client];

  return {
    apiBaseUrl: apiBaseUrl(env),
    mcpBaseUrl: mcpBaseUrl(env),
    campaignId: campaignId ?? null,
    remoteMcpUrl: remoteUrl,
    firstPrompt: INIT_AGENT_FIRST_PROMPT,
    envDefaults: {
      BOT402_API_URL: apiBaseUrl(env),
      BOT402_MCP_URL: mcpBaseUrl(env),
      BOT402_CAMPAIGN_ID: campaignLabel,
    },
    clients: selectedTargets.map((target) => ({
      id: snippets[target].id,
      title: snippets[target].title,
      snippet: snippets[target].body,
    })),
    nextCommands: [
      "402bot mcp --campaign-id defi-agent-alpha",
      '402bot discover "find the best live Base wallet-intelligence or risk API for an autonomous trading agent"',
      "402bot inspect <endpoint-id>",
    ],
  };
}

function buildInitAgentText(payload) {
  const sections = [
    "Use these defaults for agent installs:",
    "",
    `BOT402_API_URL=${payload.envDefaults.BOT402_API_URL}`,
    `BOT402_MCP_URL=${payload.envDefaults.BOT402_MCP_URL}`,
    `BOT402_CAMPAIGN_ID=${payload.envDefaults.BOT402_CAMPAIGN_ID}`,
    "",
    "Remote MCP URL:",
    payload.remoteMcpUrl,
    "",
    "First prompt:",
    payload.firstPrompt,
  ];

  for (const client of payload.clients) {
    sections.push("", `${client.title}:`, client.snippet);
  }

  sections.push(
    "",
    "Walleted execution still runs through this CLI:",
    ...payload.nextCommands,
  );

  return sections.join("\n");
}

export function buildUsage() {
  return [
    "Usage: 402bot <command> [options]",
    "",
    "Wallet and status:",
    "  402bot setup",
    "  402bot status",
    "  402bot wallet [subcommand]",
    "  402bot wallet dossier <address>",
    "",
    "Discovery and operator flows:",
    '  402bot discover "find the best live Base wallet-intelligence or risk API for an autonomous trading agent"',
    "  402bot inspect <endpoint-id-or-agent-address>",
    '  402bot compare "find the best live Base weather or risk API for a DeFi agent"',
    "  402bot recipe list",
    '  402bot recipe search "polymarket"',
    '  402bot prompt "find the best live Base treasury monitoring API"',
    '  402bot plan "monitor this wallet for treasury and prediction-market risk"',
    "  402bot discover ... --json",
    "  402bot inspect ... --json",
    "  402bot compare ... --json",
    "",
    "Paid execution:",
    "  402bot mcp --campaign-id defi-agent-alpha",
    "  402bot docs crawl https://docs.uniswap.org",
    "  402bot run wallet-research 0x1111111111111111111111111111111111111111",
    "  402bot run protocol-diligence https://docs.uniswap.org --question 'What are the obvious diligence gaps?'",
    '  402bot run market-briefing "Polymarket election odds"',
    "  402bot trade polymarket 12345 --side buy --size 5",
    '  402bot recipe run wallet-intel-brief --body \'{"input":{"walletAddress":"0x..."}}\'',
    '  402bot fetch-transform --body \'{"sourceId":"cloudflare_crawl","params":{"url":"https://docs.uniswap.org"}}\'',
    "",
    "Agent setup:",
    "  402bot init agent",
    "  402bot init agent codex --campaign-id codex-mcp-setup",
    "",
    "Environment:",
    `  BOT402_API_URL defaults to ${DEFAULT_API_BASE_URL}`,
    `  BOT402_MCP_URL defaults to ${DEFAULT_MCP_URL}`,
    "",
    "This CLI delegates wallet setup, payment handling, and spend history to x402-proxy.",
    "",
  ].join("\n");
}

export function buildProxyInvocation(argv, env = process.env) {
  const cliOptions = extractGlobalCliOptions(argv);
  const effectiveArgv = cliOptions.args;

  if (effectiveArgv.length === 0 || isHelpFlag(effectiveArgv[0])) {
    return { type: "help", text: buildUsage() };
  }

  const [command, ...rest] = effectiveArgv;

  if (command === "setup" || command === "status") {
    return { type: "proxy", proxyArgs: [command, ...rest] };
  }

  if (command === "wallet") {
    return buildWalletInvocation(rest, env);
  }

  if (command === "mcp") {
    return buildMcpInvocation(rest, env);
  }

  if (command === "discover") {
    return buildDiscoverInvocation(rest, env, cliOptions);
  }

  if (command === "inspect") {
    return buildInspectInvocation(rest, env, cliOptions);
  }

  if (command === "compare") {
    return buildCompareInvocation(rest, env, cliOptions);
  }

  if (command === "recipe") {
    return buildRecipeInvocation(rest, env, cliOptions);
  }

  if (command === "docs") {
    return buildDocsInvocation(rest, env);
  }

  if (command === "trade") {
    return buildTradeInvocation(rest, env);
  }

  if (command === "init") {
    return buildInitInvocation(rest, env, cliOptions);
  }

  if (command === "prompt") {
    return buildPromptInvocation(rest, env, cliOptions);
  }

  if (command === "plan") {
    return buildPlanInvocation(rest, env, cliOptions);
  }

  if (command === "run") {
    return buildRunInvocation(rest, env);
  }

  if (command === "polymarket") {
    return buildPolymarketInvocation(rest, env);
  }

  const surface = HTTP_SURFACES[command];
  if (surface) {
    return buildFetchInvocation(`${apiBaseUrl(env)}${surface.path}`, surface.method, rest);
  }

  return {
    type: "error",
    message: `Unknown command: ${command}\n\n${buildUsage()}`,
  };
}

function resolveProxyBin() {
  try {
    const packageJsonPath = require.resolve("x402-proxy/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const binEntry =
      typeof packageJson.bin === "string"
        ? packageJson.bin
        : packageJson.bin?.["x402-proxy"];
    if (!binEntry) {
      throw new Error("x402-proxy package.json does not expose a bin entry.");
    }
    const candidate = resolve(dirname(packageJsonPath), binEntry);
    if (existsSync(candidate)) {
      return {
        command: process.execPath,
        args: [candidate],
      };
    }
  } catch {
    // Fall back to the shell PATH when the dependency is not installed locally.
  }

  return {
    command: "x402-proxy",
    args: [],
  };
}

async function requestJson(url, { method = "GET", jsonBody } = {}) {
  const headers = {
    accept: "application/json",
  };
  const init = {
    method,
    headers,
  };

  if (jsonBody !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(jsonBody);
  }

  const response = await fetch(url, init);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let payload = raw;

  if (raw.length === 0) {
    payload = null;
  } else if (contentType.includes("application/json")) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    throw new Error(formatHttpError(response, payload));
  }

  return payload;
}

async function executeHttpInvocation(invocation) {
  const payload = await requestJson(invocation.url, {
    method: invocation.method,
    jsonBody: invocation.jsonBody,
  });

  if (invocation.jsonOutput) {
    return stringifyJson(payload);
  }

  return formatInvocationPayload(invocation.format, payload, invocation.meta);
}

async function executeLocalInvocation(invocation) {
  const discoverPayload = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: invocation.network,
    strategy: invocation.strategy,
    limit: invocation.limit,
    ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
  });

  if (invocation.action === "prompt_goal") {
    const payload = buildPromptPlanPayload(invocation.goal, discoverPayload, invocation.baseUrl);
    return invocation.jsonOutput ? stringifyJson(payload) : formatPromptPlan(payload);
  }

  if (invocation.action === "compare_goal") {
    const endpointIds = discoverPayload.results.slice(0, Math.max(2, invocation.limit)).map((entry) => entry.endpointId);
    if (endpointIds.length < 2) {
      const payload = buildCompareGoalPayload(invocation.goal, discoverPayload, null);
      return invocation.jsonOutput ? stringifyJson(payload) : formatCompareGoalPayload(payload);
    }

    const comparePayload = await requestCompareEndpoints(invocation.baseUrl, {
      endpointIds,
      days: invocation.days,
    });
    const payload = buildCompareGoalPayload(invocation.goal, discoverPayload, comparePayload);
    return invocation.jsonOutput ? stringifyJson(payload) : formatCompareGoalPayload(payload);
  }

  if (invocation.action === "plan_goal") {
    const endpointIds = discoverPayload.results.slice(0, Math.max(2, invocation.limit)).map((entry) => entry.endpointId);
    const comparePayload = endpointIds.length >= 2
      ? await requestCompareEndpoints(invocation.baseUrl, {
          endpointIds,
          days: invocation.days,
        })
      : null;
    const payload = buildExecutionPlanPayload(invocation.goal, discoverPayload, comparePayload, invocation.baseUrl);
    return invocation.jsonOutput ? stringifyJson(payload) : formatExecutionPlan(payload);
  }

  throw new Error(`Unsupported local action: ${invocation.action}`);
}

async function requestDiscoverGoal(baseUrl, body) {
  return requestJson(`${baseUrl}/v1/discover/goal`, {
    method: "POST",
    jsonBody: body,
  });
}

async function requestCompareEndpoints(baseUrl, body) {
  return requestJson(`${baseUrl}/v1/discover/compare`, {
    method: "POST",
    jsonBody: body,
  });
}

function formatInvocationPayload(format, payload, meta = {}) {
  switch (format) {
    case "discover":
      return formatDiscoverPayload(payload, meta);
    case "inspect_endpoint":
      return formatEndpointInspectionPayload(payload);
    case "inspect_agent":
      return formatAgentInspectionPayload(payload);
    case "recipes":
      return formatRecipeDirectoryPayload(payload, meta);
    default:
      return JSON.stringify(payload, null, 2);
  }
}

function buildPromptPlanPayload(goal, discoverPayload, baseUrl) {
  return {
    goal,
    resolvedCapability: discoverPayload.resolvedCapability,
    sessionId: discoverPayload.sessionId ?? discoverPayload.requestId ?? null,
    discover: discoverPayload,
    suggestedCalls: (discoverPayload.suggestedNext ?? []).map((entry) =>
      buildSuggestedActionPayload(entry, goal, baseUrl)
    ),
  };
}

function buildCompareGoalPayload(goal, discoverPayload, comparePayload) {
  return {
    goal,
    resolvedCapability: discoverPayload.resolvedCapability,
    selectedEndpointIds: discoverPayload.results.slice(0, DEFAULT_COMPARE_LIMIT).map((entry) => entry.endpointId),
    discover: discoverPayload,
    compare: comparePayload,
    note: comparePayload === null
      ? "There are not enough live candidates to run a side-by-side compare yet."
      : null,
  };
}

function buildExecutionPlanPayload(goal, discoverPayload, comparePayload, baseUrl) {
  const recommendation = chooseExecutionRecommendation(goal, discoverPayload, comparePayload);
  const sourceActions = comparePayload?.suggestedNext?.length
    ? comparePayload.suggestedNext
    : discoverPayload.suggestedNext ?? [];

  return {
    goal,
    resolvedCapability: discoverPayload.resolvedCapability,
    discover: discoverPayload,
    compare: comparePayload,
    recommendation,
    nextSteps: sourceActions.map((entry) => buildSuggestedActionPayload(entry, goal, baseUrl)),
  };
}

function formatDiscoverPayload(payload, meta = {}) {
  const lines = [
    meta.goal ? `Goal: ${meta.goal}` : null,
    `Resolved capability: ${payload.resolvedCapability}`,
    `Matched capabilities: ${(payload.matchedCapabilities ?? []).join(", ") || "n/a"}`,
    `Discovery session: ${payload.sessionId ?? payload.requestId ?? "n/a"}`,
    payload.relatedCapabilities?.length ? `Related capabilities: ${payload.relatedCapabilities.join(", ")}` : null,
    "",
    payload.results.length === 0 ? "No live candidates matched this goal." : "Top candidates:",
  ].filter(Boolean);

  for (const [index, entry] of payload.results.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${entry.endpointId}`,
      `   ${entry.resource}`,
      `   price ${formatMoney(entry.priceUsdc)} | score ${formatNumber(entry.score, 1)} | network ${entry.network}`,
      `   trust ${entry.trust?.status ?? "n/a"} | freshness ${formatFreshness(entry.dataFreshnessSeconds)} | uptime ${formatPercent(entry.trust?.uptimePct)} | success ${formatPercent(entry.trust?.successRate)}`,
      `   capabilities: ${(entry.capabilities ?? []).join(", ") || "n/a"}`,
      entry.reasons?.length ? `   why: ${entry.reasons.slice(0, 2).join(" | ")}` : "   why: no ranked reason text returned",
    );
  }

  if (payload.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry, meta.goal));
    }
  }

  return lines.join("\n");
}

function formatEndpointInspectionPayload(payload) {
  const lines = [
    `Endpoint: ${payload.endpoint?.endpointId ?? "n/a"}`,
    payload.endpoint?.resource ? `Resource: ${payload.endpoint.resource}` : null,
    `Capabilities: ${(payload.endpoint?.capabilities ?? []).join(", ") || "n/a"}`,
    `Trust: ${payload.trustProfile?.status ?? "n/a"} (${formatNumber(payload.trustProfile?.score, 1)})`,
    `Freshness: latest probe ${formatDate(payload.trustProfile?.operations?.latestProbeAt)} | healthy ${formatDate(payload.trustProfile?.operations?.lastHealthyAt)}`,
    `Payments: ${payload.payments?.totalPaymentCount ?? 0} total | ${formatMoney(payload.payments?.totalAmountUsdc)}`,
    `Routing: ${payload.routing?.totalRouteSelections ?? 0} route selections | ${payload.trustProfile?.operations?.totalProbeCount ?? 0} probes`,
    payload.trustProfile?.security?.status ? `Security: ${payload.trustProfile.security.status}` : null,
  ].filter(Boolean);

  if (payload.recentProbes?.length) {
    const latestProbe = payload.recentProbes[0];
    lines.push(
      "",
      `Latest probe: ${latestProbe.status ?? "n/a"} at ${formatDate(latestProbe.probedAt)}${latestProbe.latencyMs === undefined ? "" : ` | p50 latency ${latestProbe.latencyMs}ms`}`,
    );
  }

  if (payload.recentPayments?.length) {
    lines.push(
      "",
      "Recent payments:",
      ...payload.recentPayments.slice(0, 3).map((payment, index) =>
        `${index + 1}. ${formatMoney(payment.amountUsdc)} from ${payment.payer ?? payment.from ?? "unknown"} at ${formatDate(payment.observedAt ?? payment.createdAt)}`,
      ),
    );
  }

  if (payload.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry));
    }
  }

  return lines.join("\n");
}

function formatAgentInspectionPayload(payload) {
  const lines = [
    `Agent: ${payload.address ?? "n/a"}`,
    `Lookback: ${payload.lookbackDays ?? DEFAULT_LOOKBACK_DAYS} days`,
    `Paid route requests: ${payload.oracleUsage?.totalPaidRouteRequests ?? 0}`,
    `Payments: ${payload.payments?.totalPaymentCount ?? 0} total | ${formatMoney(payload.payments?.totalAmountUsdc)}`,
    `Wallet flow 24h: in ${formatMoney(payload.walletFlowSignals?.trailing24h?.inboundAmountUsdc)} | out ${formatMoney(payload.walletFlowSignals?.trailing24h?.outboundAmountUsdc)} | counterparties ${payload.walletFlowSignals?.trailing24h?.counterpartyCount ?? 0}`,
    `Prediction-market exposure 7d: ${payload.walletFlowSignals?.predictionMarketExposure7d?.paymentCount ?? 0} payments | ${formatMoney(payload.walletFlowSignals?.predictionMarketExposure7d?.totalAmountUsdc)}`,
  ];

  if (payload.oracleUsage?.topEndpoints?.length) {
    lines.push(
      "",
      "Top routed endpoints:",
      ...payload.oracleUsage.topEndpoints.slice(0, 3).map((entry, index) =>
        `${index + 1}. ${entry.endpoint.endpointId} | selections ${entry.selectionCount} | avg score ${formatNumber(entry.averageScore, 2)}`,
      ),
    );
  }

  if (payload.payments?.topCounterparties?.length) {
    lines.push(
      "",
      "Top counterparties:",
      ...payload.payments.topCounterparties.slice(0, 3).map((entry, index) =>
        `${index + 1}. ${entry.payTo} | ${formatMoney(entry.totalAmountUsdc)} | ${entry.paymentCount} payments`,
      ),
    );
  }

  if (payload.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry));
    }
  }

  return lines.join("\n");
}

function formatComparePayload(payload, meta = {}) {
  const lines = [
    meta.goal ? `Goal: ${meta.goal}` : null,
    `Summary: ${payload.summary}`,
    payload.relatedCapabilities?.length ? `Related capabilities: ${payload.relatedCapabilities.join(", ")}` : null,
    "",
    payload.endpoints.length === 0 ? "No endpoints resolved for comparison." : "Shortlist:",
  ].filter(Boolean);

  for (const [index, entry] of payload.endpoints.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${entry.endpoint.endpointId}`,
      `   ${entry.recommendation.replaceAll("_", " ")} | trust ${formatNumber(entry.trustScore, 1)} | security ${entry.securityStatus}`,
      `   price ${formatMoney(entry.endpoint.priceUsdc)} | latest probe ${formatDate(entry.latestProbeAt)} | last healthy ${formatDate(entry.lastHealthyAt)}`,
      `   payments ${entry.totalPayments ?? 0} | route selections ${entry.totalRouteSelections ?? 0}`,
    );
  }

  if (payload.synthesis?.summary) {
    lines.push(
      "",
      `Synthesis: ${payload.synthesis.summary}`,
    );
    if (payload.synthesis.keyDifferences?.length) {
      lines.push(...payload.synthesis.keyDifferences.map((entry) => `- ${entry}`));
    }
    if (payload.synthesis.tradeoffs?.length) {
      lines.push(...payload.synthesis.tradeoffs.map((entry) => `- ${entry}`));
    }
  }

  if (payload.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry, meta.goal));
    }
  }

  return lines.join("\n");
}

function formatRecipeDirectoryPayload(payload, meta = {}) {
  const queryLabel = meta.query ? `Recipes matching "${meta.query}"` : "Recipes";
  const lines = [
    `${queryLabel}: ${payload.totalRecipes ?? 0} total`,
    payload.nextCursor ? `Next cursor: ${payload.nextCursor}` : null,
    "",
  ].filter(Boolean);

  for (const [index, entry] of (payload.results ?? []).slice(0, 10).entries()) {
    lines.push(
      `${index + 1}. ${entry.recipe.displayName} [${entry.recipe.slug}]`,
      `   cluster ${entry.marketplace?.cluster ?? "n/a"} | price ${formatMoney(entry.recipe.priceUsdc)} | quality ${formatNumber(entry.stats?.qualityScore, 2)} | freshness ${formatNumber(entry.stats?.freshnessScore, 2)}`,
      `   capabilities: ${(entry.recipe.capabilities ?? []).join(", ") || "n/a"}`,
      `   ${entry.recipe.summary}`,
    );
  }

  if ((payload.results ?? []).length === 0) {
    lines.push("No recipes matched the current filters.");
  }

  return lines.join("\n");
}

function formatPromptPlan(payload) {
  const lines = [
    `Goal: ${payload.goal}`,
    `Resolved capability: ${payload.resolvedCapability}`,
    "",
    "Exact next calls:",
  ];

  if (payload.suggestedCalls.length === 0) {
    lines.push("1. Re-run discovery with a broader goal or a less strict budget.");
    return lines.join("\n");
  }

  payload.suggestedCalls.slice(0, 4).forEach((entry, index) => {
    lines.push(`${index + 1}. ${formatActionHeadline(entry)}`);
    for (const detail of formatSuggestedActionPayload(entry)) {
      lines.push(`   ${detail}`);
    }
  });

  return lines.join("\n");
}

function formatCompareGoalPayload(payload) {
  if (payload.compare === null) {
    return [
      `Goal: ${payload.goal}`,
      "",
      payload.note,
      "",
      formatDiscoverPayload(payload.discover, { goal: payload.goal }),
    ].join("\n");
  }

  return formatComparePayload(payload.compare, {
    goal: payload.goal,
    discoverPayload: payload.discover,
  });
}

function formatExecutionPlan(payload) {
  const lines = [
    `Task: ${payload.goal}`,
    `Resolved capability: ${payload.resolvedCapability}`,
    `Recommended execution surface: ${payload.recommendation.title}`,
    payload.recommendation.reason,
    "",
    `Recommended command: ${payload.recommendation.command}`,
  ];

  if (payload.compare?.summary) {
    lines.push("", `Shortlist summary: ${payload.compare.summary}`);
  } else if (payload.discover.results[0]) {
    lines.push("", `Lead candidate: ${payload.discover.results[0].endpointId}`);
  }

  lines.push("", "Next steps:");
  for (const [index, entry] of payload.nextSteps.slice(0, 4).entries()) {
    lines.push(`${index + 1}. ${formatActionHeadline(entry)}`);
    for (const detail of formatSuggestedActionPayload(entry)) {
      lines.push(`   ${detail}`);
    }
  }

  return lines.join("\n");
}

function chooseExecutionRecommendation(goal, discoverPayload, comparePayload) {
  const urlMatch = extractFirstUrl(goal);
  if (urlMatch) {
    return {
      title: "Docs crawl",
      reason: "The task includes a concrete URL, so the fastest opinionated execution surface is a bounded docs crawl.",
      command: `402bot docs crawl ${urlMatch}`,
    };
  }

  const addressMatch = extractFirstAddress(goal);
  if (addressMatch && /(wallet|treasury|portfolio|counterparty|agent)/i.test(goal)) {
    return {
      title: "Wallet dossier",
      reason: "The task centers on one wallet or agent address, so the best packaged surface is the wallet dossier recipe wrapper.",
      command: `402bot wallet dossier ${addressMatch}`,
    };
  }

  if (/(trade|buy|sell|order)/i.test(goal) && /polymarket|prediction market/i.test(goal)) {
    return {
      title: "Polymarket trade",
      reason: "The task reads like an execution request, so the higher-level order wrapper is the right next paid surface.",
      command: "402bot trade polymarket <token-id> --side buy --size 1",
    };
  }

  if (/polymarket|prediction market/i.test(goal)) {
    return {
      title: "Market briefing workflow",
      reason: "The task is market-intel oriented rather than immediate order execution, so the radar workflow is the better packaged path.",
      command: `402bot run market-briefing ${quoteShellValue(goal)}`,
    };
  }

  const winner = comparePayload?.endpoints?.[0]?.endpoint ?? discoverPayload.results?.[0];
  if (winner?.endpointId?.startsWith("recipe-")) {
    const recipeSlug = winner.endpointId.slice("recipe-".length);
    return {
      title: "Recipe execution",
      reason: "The leading candidate is already a recipe surface, so the right execution lane is a recipe run rather than a generic route purchase.",
      command: `402bot recipe run ${recipeSlug} --body '${JSON.stringify({ input: {} })}'`,
    };
  }

  return {
    title: "Best-route purchase",
    reason: "The task still looks like generic capability routing, so the cleanest paid execution surface is the route API.",
    command: `402bot route --body ${quoteShellValue(JSON.stringify({
      capability: discoverPayload.resolvedCapability,
      network: discoverPayload.results?.[0]?.network ?? DEFAULT_NETWORK,
      strategy: comparePayload?.endpoints?.length ? "balanced" : discoverPayload.strategy ?? "balanced",
      limit: Math.min(3, Math.max(1, (comparePayload?.endpoints?.length ?? discoverPayload.results?.length ?? 1))),
    }))}`,
  };
}

function formatSuggestedAction(entry, goal, baseUrl = DEFAULT_API_BASE_URL) {
  return formatSuggestedActionPayload(buildSuggestedActionPayload(entry, goal, baseUrl));
}

function buildSuggestedActionPayload(entry, goal, baseUrl = DEFAULT_API_BASE_URL) {
  const payload = {
    tool: entry.tool,
    reason: entry.reason,
    args: entry.args ?? {},
    mcpCall: {
      tool: entry.tool,
      args: entry.args ?? {},
    },
  };

  switch (entry.tool) {
    case "inspect_endpoint":
      if (entry.args?.endpointId) {
        payload.cliCommand = `402bot inspect ${entry.args.endpointId}`;
      }
      break;
    case "inspect_agent":
      if (entry.args?.address) {
        payload.cliCommand = `402bot inspect ${entry.args.address}`;
      }
      break;
    case "buy_best_route":
      payload.cliCommand = `402bot route --body ${quoteShellValue(JSON.stringify(entry.args ?? {}))}`;
      payload.httpRequest = {
        method: "POST",
        url: `${baseUrl}/v1/route`,
        body: entry.args ?? {},
      };
      break;
    case "compare_endpoints":
      if (goal) {
        payload.cliCommand = `402bot compare ${quoteShellValue(goal)}`;
      }
      payload.httpRequest = {
        method: "POST",
        url: `${baseUrl}/v1/discover/compare`,
        body: entry.args ?? {},
      };
      break;
    case "continue_discovery_session":
      payload.httpRequest = {
        method: "POST",
        url: `${baseUrl}/v1/discover/continue`,
        body: entry.args ?? {},
      };
      break;
    case "review_endpoint_readiness":
      if (entry.args?.endpointId) {
        payload.cliCommand = `402bot inspect ${entry.args.endpointId}`;
      }
      break;
    default:
      break;
  }

  return payload;
}

function formatSuggestedActionPayload(payload) {
  const details = [
    `Reason: ${payload.reason}`,
    `MCP: ${payload.mcpCall.tool} ${JSON.stringify(payload.mcpCall.args)}`,
  ];

  if (payload.cliCommand) {
    details.push(`CLI: ${payload.cliCommand}`);
  }

  if (payload.httpRequest) {
    details.push(`HTTP: ${payload.httpRequest.method} ${payload.httpRequest.url} ${JSON.stringify(payload.httpRequest.body)}`);
  }

  return details;
}

function formatActionHeadline(entry) {
  switch (entry.tool) {
    case "inspect_endpoint":
      return `Inspect endpoint ${entry.args?.endpointId ?? ""}`.trim();
    case "inspect_agent":
      return `Inspect agent ${entry.args?.address ?? ""}`.trim();
    case "buy_best_route":
      return `Buy the best live route for ${entry.args?.capability ?? "the resolved capability"}`;
    case "compare_endpoints":
      return `Compare ${Array.isArray(entry.args?.endpointIds) ? entry.args.endpointIds.length : ""} endpoint candidates`.trim();
    case "continue_discovery_session":
      return "Continue the discovery session with exclusions";
    case "review_endpoint_readiness":
      return `Review readiness for ${entry.args?.endpointId ?? "the inspected endpoint"}`;
    default:
      return entry.tool;
  }
}

function formatHttpError(response, payload) {
  const headline = `${response.status} ${response.statusText}`.trim();
  if (payload && typeof payload === "object") {
    const title = payload.title ? `${payload.title}` : null;
    const detail = payload.detail === undefined ? null : JSON.stringify(payload.detail, null, 2);
    return [headline, title, detail].filter(Boolean).join("\n");
  }
  return payload ? `${headline}\n${String(payload)}` : headline;
}

function buildUrlWithQuery(base, query) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseOptionArgs(args, specs) {
  const byFlag = new Map();
  for (const spec of specs) {
    for (const flag of spec.flags) {
      byFlag.set(flag, spec);
    }
  }

  const options = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const spec = byFlag.get(flag);
    if (!spec) {
      return {
        ok: false,
        message: `Unknown option: ${flag}`,
      };
    }

    let rawValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
    if (spec.type === "boolean") {
      options[spec.key] = rawValue === undefined ? true : parseBooleanValue(rawValue);
      continue;
    }

    if (rawValue === undefined) {
      rawValue = args[index + 1];
      if (rawValue === undefined) {
        return {
          ok: false,
          message: `${flag} requires a value.`,
        };
      }
      index += 1;
    }

    if (spec.parse) {
      const parsed = spec.parse(rawValue);
      if (!parsed.ok) {
        return {
          ok: false,
          message: `${flag} ${parsed.message}`,
        };
      }
      options[spec.key] = parsed.value;
      continue;
    }

    options[spec.key] = rawValue;
  }

  return {
    ok: true,
    options,
    positionals,
  };
}

function parsePositiveIntValue(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      ok: false,
      message: "must be a positive integer.",
    };
  }
  return {
    ok: true,
    value: parsed,
  };
}

function parsePositiveNumberValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      message: "must be a positive number.",
    };
  }
  return {
    ok: true,
    value: parsed,
  };
}

function parseStrategyValue(value) {
  if (!["lowest_price", "balanced", "highest_trust"].includes(value)) {
    return {
      ok: false,
      message: "must be one of lowest_price, balanced, or highest_trust.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseRecipeSortValue(value) {
  if (!["relevance", "newest", "price_low", "quality"].includes(value)) {
    return {
      ok: false,
      message: "must be one of relevance, newest, price_low, or quality.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseWalletProfileValue(value) {
  if (!["wallet", "polymarket"].includes(value)) {
    return {
      ok: false,
      message: "must be one of wallet or polymarket.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parsePolymarketSideValue(value) {
  const normalized = value.trim().toUpperCase();
  if (!["BUY", "SELL"].includes(normalized)) {
    return {
      ok: false,
      message: "must be buy or sell.",
    };
  }
  return {
    ok: true,
    value: normalized,
  };
}

function parsePolymarketOrderKindValue(value) {
  const normalized = value.trim().toLowerCase();
  if (!["market", "limit"].includes(normalized)) {
    return {
      ok: false,
      message: "must be market or limit.",
    };
  }
  return {
    ok: true,
    value: normalized,
  };
}

function parsePolymarketTimeInForceValue(value) {
  const normalized = value.trim().toUpperCase();
  if (!["GTC", "GTD", "FOK", "FAK"].includes(normalized)) {
    return {
      ok: false,
      message: "must be one of GTC, GTD, FOK, or FAK.",
    };
  }
  return {
    ok: true,
    value: normalized,
  };
}

function parseBooleanValue(value) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function joinPositionals(positionals) {
  return positionals.join(" ").trim();
}

function normalizeAgentTarget(value) {
  if (value.startsWith("agent:")) {
    return value.slice("agent:".length);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value : null;
}

function normalizeEndpointTarget(value) {
  if (value.startsWith("endpoint:")) {
    return value.slice("endpoint:".length);
  }
  return value;
}

function extractFirstUrl(value) {
  const match = value.match(/https?:\/\/\S+/i);
  return match?.[0] ?? null;
}

function extractFirstAddress(value) {
  const match = value.match(/0x[a-fA-F0-9]{40}/);
  return match?.[0] ?? null;
}

function quoteShellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function formatMoney(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  return `$${value.toFixed(value < 0.01 ? 4 : 3)}`;
}

function formatNumber(value, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function formatFreshness(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  if (value < 60) {
    return `${value}s`;
  }
  if (value < 3600) {
    return `${(value / 60).toFixed(1)}m`;
  }
  if (value < 86400) {
    return `${(value / 3600).toFixed(1)}h`;
  }
  return `${(value / 86400).toFixed(1)}d`;
}

function formatDate(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
}

function stringifyJson(payload) {
  return JSON.stringify(payload, null, 2);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const invocation = buildProxyInvocation(argv, env);

  if (invocation.type === "help") {
    process.stdout.write(`${invocation.text}\n`);
    return 0;
  }

  if (invocation.type === "error") {
    process.stderr.write(`${invocation.message}\n`);
    return 1;
  }

  if (invocation.type === "print") {
    process.stdout.write(`${invocation.jsonOutput ? stringifyJson(invocation.data ?? invocation.text) : invocation.text}\n`);
    return 0;
  }

  if (invocation.type === "http") {
    try {
      const output = await executeHttpInvocation(invocation);
      process.stdout.write(`${output}\n`);
      return 0;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${detail}\n`);
      return 1;
    }
  }

  if (invocation.type === "local") {
    try {
      const output = await executeLocalInvocation(invocation);
      process.stdout.write(`${output}\n`);
      return 0;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${detail}\n`);
      return 1;
    }
  }

  const proxyBin = resolveProxyBin();
  const child = spawn(proxyBin.command, [...proxyBin.args, ...invocation.proxyArgs], {
    stdio: "inherit",
    env,
  });

  return await new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

export function isEntrypoint(argv = process.argv) {
  const candidatePath = argv[1];
  if (!candidatePath) {
    return false;
  }

  try {
    return realpathSync(candidatePath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().then((code) => {
    process.exit(code);
  }).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${detail}\n`);
    process.exit(1);
  });
}

#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const DEFAULT_API_BASE_URL = "https://api.402.bot";
export const DEFAULT_MCP_URL = "https://api.402.bot/mcp";
export const DEFAULT_NETWORK = "eip155:8453";
export const DEFAULT_DUNE_MCP_URL = "https://api.dune.com/mcp/v1";

const BASE_RPC_URL = "https://mainnet.base.org";
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_DISCOVER_LIMIT = 5;
const DEFAULT_COMPARE_LIMIT = 3;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_RECIPE_LIMIT = 12;
const DEFAULT_RECIPE_SORT = "quality";
const DEFAULT_CRAWL_SOURCE = "cloudflare_crawl";
const DEFAULT_POLYMARKET_PROFILE_DAYS = 30;
const DEFAULT_PROTOCOL_DILIGENCE_QUESTION =
  "What kind of site is this and what diligence gaps are obvious from public evidence?";
const DEFAULT_DOCTOR_TIMEOUT_MS = 8000;
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_CRAWL_PROFILE = "brief";
const DEFAULT_CRAWL_SCOPE = "domain";
const DEFAULT_WATCH_INTERVAL = "30s";
const DEFAULT_WATCH_TIMEOUT = "5m";
const DEFAULT_PROVIDER_LIMIT = 20;
const POLYMARKET_SEARCH_URL = "https://gamma-api.polymarket.com/public-search";
const LLMS_URL = "https://402.bot/llms.txt";
const LLMS_FULL_URL = "https://402.bot/llms-full.txt";
const INIT_AGENT_FIRST_PROMPT =
  "Find the best live Base wallet-intelligence or risk API for an autonomous trading agent, show me the top 3 candidates, and tell me the exact next MCP call to make.";
const DUNE_CLI_INSTALL_COMMAND = "curl -sSfL https://dune.com/cli/install.sh | sh";
const DUNE_AUTH_COMMAND = "dune auth";
const DUNE_SKILLS_ADD_COMMAND = "npx skills add duneanalytics/skills";
const DEFAULT_STAKING_SCORECARD_PROTOCOLS = [
  "lido",
  "rocket-pool",
  "coinbase-wrapped-staked-eth",
  "ether.fi",
  "frax-ether",
  "swell",
];
const DEFAULT_LST_RATE_ASSETS = ["wsteth", "reth", "cbeth", "weeth", "sfrxeth", "sweth", "ethx"];
const COINGECKO_JSON_OUTPUT_COMMANDS = new Set([
  "price",
  "markets",
  "search",
  "trending",
  "history",
  "top-gainers-losers",
  "watch",
  "version",
]);
const COINGECKO_INTRINSIC_JSON_COMMANDS = new Set(["commands"]);
const COINGECKO_ALLOWED_COMMANDS = new Set([
  "auth",
  "status",
  "price",
  "markets",
  "search",
  "trending",
  "history",
  "top-gainers-losers",
  "watch",
  "tui",
  "commands",
  "version",
  "help",
  "--help",
  "-h",
]);

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

const DISCOVER_OPTION_SPECS = GOAL_OPTION_SPECS.concat([
  {
    flags: ["--max-price", "--max-price-usdc"],
    key: "maxPriceUsdc",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--freshness"],
    key: "freshness",
    parse: parseTimeWindowValue,
  },
  {
    flags: ["--trust"],
    key: "trust",
    parse: parseDiscoverTrustValue,
  },
  {
    flags: ["--provider"],
    key: "provider",
  },
  {
    flags: ["--requires-mcp"],
    key: "requiresMcp",
    type: "boolean",
  },
  {
    flags: ["--asset"],
    key: "asset",
  },
]);

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
  {
    flags: ["--outcome"],
    key: "outcome",
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

const DOCS_CRAWL_OPTION_SPECS = [
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
  {
    flags: ["--scope"],
    key: "scope",
    parse: parseDocsScopeValue,
  },
  {
    flags: ["--profile"],
    key: "profile",
    parse: parseDocsProfileValue,
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

const DUNE_ANALYSIS_OPTION_SPECS = [
  {
    flags: ["--target"],
    key: "target",
  },
  {
    flags: ["--chain", "--chains"],
    key: "chains",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--days"],
    key: "days",
    parse: parsePositiveIntValue,
  },
];

const SWAP_ROUTE_OPTION_SPECS = [
  {
    flags: ["--network"],
    key: "network",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--src-decimals"],
    key: "srcDecimals",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--dest-decimals"],
    key: "destDecimals",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--side"],
    key: "side",
    parse: parseParaswapSideValue,
  },
  {
    flags: ["--goal"],
    key: "goal",
  },
];

const JUPITER_ROUTE_OPTION_SPECS = [
  {
    flags: ["--slippage-bps"],
    key: "slippageBps",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--swap-mode"],
    key: "swapMode",
    parse: parseJupiterSwapModeValue,
  },
  {
    flags: ["--only-direct-routes"],
    key: "onlyDirectRoutes",
    type: "boolean",
  },
  {
    flags: ["--restrict-intermediate-tokens"],
    key: "restrictIntermediateTokens",
    type: "boolean",
  },
  {
    flags: ["--goal"],
    key: "goal",
  },
];

const STAKING_SCORECARD_OPTION_SPECS = [
  {
    flags: ["--protocols"],
    key: "protocols",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--min-tvl", "--min-tvl-usd"],
    key: "minTvlUsd",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
];

const CEX_DISLOCATION_OPTION_SPECS = [
  {
    flags: ["--quote", "--quote-asset"],
    key: "quoteAsset",
  },
  {
    flags: ["--exchanges"],
    key: "exchanges",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--include-funding"],
    key: "includeFunding",
    type: "boolean",
  },
  {
    flags: ["--question"],
    key: "question",
  },
];

const LST_RATE_OPTION_SPECS = [
  {
    flags: ["--assets"],
    key: "assets",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--question"],
    key: "question",
  },
];

const LST_PREMIUM_OPTION_SPECS = [
  {
    flags: ["--assets"],
    key: "assets",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--protocols"],
    key: "protocols",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--min-tvl", "--min-tvl-usd"],
    key: "minTvlUsd",
    parse: parsePositiveNumberValue,
  },
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
];

const PARASWAP_VS_JUPITER_OPTION_SPECS = [
  {
    flags: ["--paraswap-network"],
    key: "paraswapNetwork",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--paraswap-src-decimals"],
    key: "paraswapSrcDecimals",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--paraswap-dest-decimals"],
    key: "paraswapDestDecimals",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--paraswap-side"],
    key: "paraswapSide",
    parse: parseParaswapSideValue,
  },
  {
    flags: ["--jupiter-slippage-bps"],
    key: "jupiterSlippageBps",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--jupiter-swap-mode"],
    key: "jupiterSwapMode",
    parse: parseJupiterSwapModeValue,
  },
  {
    flags: ["--jupiter-only-direct-routes"],
    key: "jupiterOnlyDirectRoutes",
    type: "boolean",
  },
  {
    flags: ["--jupiter-restrict-intermediate-tokens"],
    key: "jupiterRestrictIntermediateTokens",
    type: "boolean",
  },
  {
    flags: ["--goal"],
    key: "goal",
  },
];

const CROSSCHAIN_EXECUTION_OPTION_SPECS = [
  {
    flags: ["--quote", "--quote-asset"],
    key: "quoteAsset",
  },
  {
    flags: ["--exchanges"],
    key: "exchanges",
    parse: parseCommaSeparatedListValue,
  },
  {
    flags: ["--include-funding"],
    key: "includeFunding",
    type: "boolean",
  },
  {
    flags: ["--slippage-bps"],
    key: "slippageBps",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--swap-mode"],
    key: "swapMode",
    parse: parseJupiterSwapModeValue,
  },
  {
    flags: ["--goal"],
    key: "goal",
  },
];

const HISTORY_OPTION_SPECS = [
  {
    flags: ["--since"],
    key: "since",
    parse: parseTimeWindowValue,
  },
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
];

const SPEND_OPTION_SPECS = [
  {
    flags: ["--since"],
    key: "since",
    parse: parseTimeWindowValue,
  },
];

const RECIPE_RUN_OPTION_SPECS = [
  {
    flags: ["--wait"],
    key: "wait",
    type: "boolean",
  },
  {
    flags: ["--open"],
    key: "open",
    type: "boolean",
  },
  {
    flags: ["--save"],
    key: "savePath",
  },
  {
    flags: ["--from-file"],
    key: "fromFile",
  },
];

const PROVIDER_DIRECTORY_OPTION_SPECS = [
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--recommendation"],
    key: "recommendation",
  },
];

const AG0_SEARCH_OPTION_SPECS = [
  {
    flags: ["--limit"],
    key: "limit",
    parse: parsePositiveIntValue,
  },
  {
    flags: ["--network"],
    key: "network",
  },
  {
    flags: ["--agent-id"],
    key: "agentId",
  },
];

const DOCTOR_OPTION_SPECS = [
  {
    flags: ["--fix"],
    key: "fix",
    type: "boolean",
  },
];

const WATCH_OPTION_SPECS = [
  {
    flags: ["--interval"],
    key: "interval",
    parse: parseTimeWindowValue,
  },
  {
    flags: ["--since"],
    key: "since",
    parse: parseTimeWindowValue,
  },
  {
    flags: ["--timeout"],
    key: "timeout",
    parse: parseTimeWindowValue,
  },
  {
    flags: ["--once"],
    key: "once",
    type: "boolean",
  },
  {
    flags: ["--webhook-url"],
    key: "webhookUrl",
  },
  {
    flags: ["--exit-on-change"],
    key: "exitOnChange",
    type: "boolean",
  },
];

function apiBaseUrl(env = process.env) {
  return env.BOT402_API_URL || DEFAULT_API_BASE_URL;
}

function mcpBaseUrl(env = process.env) {
  return env.BOT402_MCP_URL || DEFAULT_MCP_URL;
}

async function loadRuntime() {
  return import("./runtime.js");
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
  return {
    ...invocation,
    jsonOutput: true,
  };
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

function flagRequiresValue(flag) {
  return ![
    "--json",
    "--json=true",
    "--json=false",
    "--post-only",
  ].includes(flag);
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

function buildFetchInvocation(url, method, args, cliOptions = {}) {
  const normalizedArgs = normalizeProxyFetchArgs(args);
  const proxyArgs = [];

  if (method !== "GET") {
    proxyArgs.push("--method", method);
  }
  if (method !== "GET" && hasBodyArg(normalizedArgs) && !hasContentTypeHeader(normalizedArgs)) {
    proxyArgs.push("--header", "Content-Type: application/json");
  }

  proxyArgs.push(...normalizedArgs, url);
  return withJsonOutput({ type: "proxy", proxyArgs }, cliOptions.jsonOutput);
}

function buildJsonFetchInvocation(url, method, body, cliOptions = {}) {
  return buildFetchInvocation(url, method, ["--body", JSON.stringify(body)], cliOptions);
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

function buildSetupInvocation(args, cliOptions = {}) {
  if (args.some(isHelpFlag)) {
    return { type: "proxy", proxyArgs: ["setup", ...args] };
  }

  return withJsonOutput({
    type: "local",
    action: "setup",
    setupArgs: args,
  }, cliOptions.jsonOutput);
}

function buildMcpInvocation(args, env = process.env, cliOptions = {}) {
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

  return withJsonOutput({
    type: "proxy",
    proxyArgs: ["mcp", ...passthrough, buildRemoteMcpUrl(remoteUrl, campaignId)],
  }, cliOptions.jsonOutput);
}

function buildDiscoverInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, DISCOVER_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return {
      type: "error",
      message:
        'Usage: 402bot discover "<goal>" [--network ...] [--strategy ...] [--limit ...] [--budget ...] [--max-price ...] [--freshness 6h] [--trust observed|verified] [--provider ...] [--requires-mcp] [--asset USDC]',
    };
  }

  return withJsonOutput({
    type: "local",
    action: "discover_goal",
    baseUrl: apiBaseUrl(env),
    goal,
    network: parsed.options.network ?? DEFAULT_NETWORK,
    useConfiguredNetworkDefault: parsed.options.network === undefined,
    strategy: parsed.options.strategy ?? "balanced",
    limit: parsed.options.limit ?? DEFAULT_DISCOVER_LIMIT,
    budgetUsdc: parsed.options.budgetUsdc,
    filters: {
      maxPriceUsdc: parsed.options.maxPriceUsdc,
      freshness: parsed.options.freshness,
      trust: parsed.options.trust,
      provider: parsed.options.provider,
      requiresMcp: parsed.options.requiresMcp,
      asset: parsed.options.asset,
    },
  }, cliOptions.jsonOutput);
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
  const normalizedAgent = normalizeAgentTarget(rawTarget);

  if (normalizedAgent) {
    return withJsonOutput({
      type: "local",
      action: "inspect_agent",
      baseUrl: apiBaseUrl(env),
      address: normalizedAgent,
      days: parsed.options.days ?? DEFAULT_LOOKBACK_DAYS,
      network: parsed.options.network ?? DEFAULT_NETWORK,
      useConfiguredNetworkDefault: parsed.options.network === undefined,
    }, cliOptions.jsonOutput);
  }

  return withJsonOutput({
    type: "local",
    action: "inspect_endpoint",
    baseUrl: apiBaseUrl(env),
    endpointId: normalizeEndpointTarget(rawTarget),
    days: parsed.options.days ?? DEFAULT_LOOKBACK_DAYS,
  }, cliOptions.jsonOutput);
}

function buildCompareInvocation(args, env = process.env, cliOptions = {}) {
  const parsed = parseOptionArgs(args, GOAL_OPTION_SPECS.concat(LOOKBACK_OPTION_SPECS));
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }

  const goal = joinPositionals(parsed.positionals);
  if (!goal) {
    return {
      type: "error",
      message: 'Usage: 402bot compare "<goal>" [--network ...] [--strategy ...] [--limit ...] [--budget ...] [--days 30]',
    };
  }

  return withJsonOutput({
    type: "local",
    action: "compare_goal",
    baseUrl: apiBaseUrl(env),
    goal,
    network: parsed.options.network ?? DEFAULT_NETWORK,
    useConfiguredNetworkDefault: parsed.options.network === undefined,
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
    useConfiguredNetworkDefault: parsed.options.network === undefined,
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
    useConfiguredNetworkDefault: parsed.options.network === undefined,
    strategy: parsed.options.strategy ?? "balanced",
    limit: parsed.options.limit ?? DEFAULT_COMPARE_LIMIT,
    budgetUsdc: parsed.options.budgetUsdc,
    days: parsed.options.days ?? DEFAULT_LOOKBACK_DAYS,
  }, cliOptions.jsonOutput);
}

function buildRecipeInvocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;

  if (action === "run") {
    const parsed = parseRecipeRunArgs(rest);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    const [slug, ...trailing] = parsed.positionals;
    if (!slug || slug.startsWith("-")) {
      return { type: "error", message: "recipe run requires a <slug>." };
    }
    if (trailing.length > 0) {
      return { type: "error", message: "recipe run accepts exactly one <slug> positional value." };
    }

    const advancedRun = parsed.options.wait || parsed.options.open || parsed.options.savePath || parsed.options.fromFile;
    if (!advancedRun) {
      return buildFetchInvocation(
        `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}/run`,
        "POST",
        rest.slice(1),
        cliOptions,
      );
    }

    return withJsonOutput({
      type: "local",
      action: "recipe_run",
      baseUrl: apiBaseUrl(env),
      slug,
      forwardedArgs: parsed.forwardedArgs,
      wait: Boolean(parsed.options.wait),
      open: Boolean(parsed.options.open),
      savePath: parsed.options.savePath ?? null,
      fromFile: parsed.options.fromFile ?? null,
    }, cliOptions.jsonOutput);
  }

  if (action === "inspect") {
    const slug = rest[0];
    if (!slug || slug.startsWith("-") || rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot recipe inspect <slug>" };
    }
    return withJsonOutput(buildHttpInvocation(
      `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}`,
      "GET",
      "recipe_detail",
      { slug },
    ), cliOptions.jsonOutput);
  }

  if (action === "recommend") {
    const goal = joinPositionals(rest);
    if (!goal) {
      return { type: "error", message: 'Usage: 402bot recipe recommend "<goal>"' };
    }
    return withJsonOutput({
      type: "local",
      action: "recipe_recommend",
      baseUrl: apiBaseUrl(env),
      goal,
    }, cliOptions.jsonOutput);
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
    message: "Usage: 402bot recipe <run|list|search|inspect|recommend> ...",
  };
}

function buildProvidersInvocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;

  if (action === "inspect") {
    const slug = rest[0];
    if (!slug || slug.startsWith("-") || rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot providers inspect <slug>" };
    }
    return withJsonOutput(buildHttpInvocation(
      `${apiBaseUrl(env)}/v1/providers/${encodeURIComponent(slug)}`,
      "GET",
      "provider_detail",
      { slug },
    ), cliOptions.jsonOutput);
  }

  if (action === "list" || action === "search") {
    const parsed = parseOptionArgs(rest, PROVIDER_DIRECTORY_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    const query = action === "search" ? joinPositionals(parsed.positionals) : null;
    if (action === "search" && !query) {
      return { type: "error", message: 'Usage: 402bot providers search "<query>" [--limit ...]' };
    }
    if (action === "list" && parsed.positionals.length > 0) {
      return { type: "error", message: "providers list does not take positional arguments." };
    }
    return withJsonOutput({
      type: "local",
      action: "providers_directory",
      baseUrl: apiBaseUrl(env),
      mode: action,
      query,
      limit: parsed.options.limit ?? DEFAULT_PROVIDER_LIMIT,
      recommendation: parsed.options.recommendation ?? null,
    }, cliOptions.jsonOutput);
  }

  return {
    type: "error",
    message: "Usage: 402bot providers <list|search|inspect> ...",
  };
}

function buildMarketInvocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;
  if (!action) {
    return {
      type: "error",
      message:
        "Usage: 402bot market <doctor|price|markets|search|trending|history|top-gainers-losers|watch|tui|commands|status|auth|version> ...",
    };
  }

  if (action === "doctor") {
    if (rest.length > 0) {
      return { type: "error", message: "market doctor does not take positional arguments." };
    }
    return withJsonOutput({
      type: "local",
      action: "market_doctor",
      command: resolveCoinGeckoCliCommand(env),
    }, cliOptions.jsonOutput);
  }

  if (!COINGECKO_ALLOWED_COMMANDS.has(action)) {
    return {
      type: "error",
      message:
        "Usage: 402bot market <doctor|price|markets|search|trending|history|top-gainers-losers|watch|tui|commands|status|auth|version> ...",
    };
  }

  if (action === "tui" && cliOptions.jsonOutput) {
    return { type: "error", message: "market tui does not support --json." };
  }

  return withJsonOutput({
    type: "local",
    action: "market_passthrough",
    command: resolveCoinGeckoCliCommand(env),
    marketAction: action,
    forwardedArgs: [action, ...rest],
  }, cliOptions.jsonOutput);
}

function buildAg0Invocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;

  if (action === "search") {
    const parsed = parseOptionArgs(rest, AG0_SEARCH_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    const capability = joinPositionals(parsed.positionals);
    if (!capability && !parsed.options.agentId) {
      return { type: "error", message: 'Usage: 402bot ag0 search "<capability>" [--network ...] [--limit ...] [--agent-id ...]' };
    }

    return withJsonOutput(buildHttpInvocation(
      buildUrlWithQuery(`${apiBaseUrl(env)}/v1/ag0/search`, {
        capability: capability || undefined,
        network: parsed.options.network,
        limit: parsed.options.limit ?? DEFAULT_PROVIDER_LIMIT,
        agentId: parsed.options.agentId,
      }),
      "GET",
      "ag0_search",
      { capability, agentId: parsed.options.agentId ?? null },
    ), cliOptions.jsonOutput);
  }

  if (action === "inspect") {
    const agentId = rest[0];
    if (!agentId || agentId.startsWith("-") || rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot ag0 inspect <agent-id>" };
    }
    return withJsonOutput(buildHttpInvocation(
      `${apiBaseUrl(env)}/v1/ag0/inspect/${encodeURIComponent(agentId)}`,
      "GET",
      "ag0_inspect",
      { agentId },
    ), cliOptions.jsonOutput);
  }

  if (action === "dossier") {
    const agentId = rest[0];
    if (!agentId || agentId.startsWith("-") || rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot ag0 dossier <agent-id>" };
    }
    return withJsonOutput(buildHttpInvocation(
      `${apiBaseUrl(env)}/v1/ag0/dossier/${encodeURIComponent(agentId)}`,
      "GET",
      "ag0_dossier",
      { agentId },
    ), cliOptions.jsonOutput);
  }

  return {
    type: "error",
    message: "Usage: 402bot ag0 <search|inspect|dossier> ...",
  };
}

function buildCatalogInvocation(args, env = process.env, cliOptions = {}) {
  const [action, ...rest] = args;
  if (action !== "update" || rest.length > 0) {
    return { type: "error", message: "Usage: 402bot catalog update" };
  }
  return withJsonOutput({
    type: "local",
    action: "catalog_update",
    baseUrl: apiBaseUrl(env),
  }, cliOptions.jsonOutput);
}

function buildWatchInvocation(args, env = process.env, cliOptions = {}) {
  const [targetType, ...rest] = args;
  if (!["wallet", "endpoint", "provider"].includes(targetType)) {
    return { type: "error", message: "Usage: 402bot watch <wallet|endpoint|provider> <target> [--interval ...] [--since ...] [--timeout ...] [--once] [--webhook-url ...]" };
  }

  const parsed = parseOptionArgs(rest, WATCH_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return { type: "error", message: `watch ${targetType} requires exactly one target value.` };
  }

  return withJsonOutput({
    type: "local",
    action: "watch",
    baseUrl: apiBaseUrl(env),
    targetType,
    targetValue: parsed.positionals[0],
    interval: parsed.options.interval ?? DEFAULT_WATCH_INTERVAL,
    since: parsed.options.since ?? null,
    timeout: parsed.options.timeout ?? DEFAULT_WATCH_TIMEOUT,
    once: Boolean(parsed.options.once),
    webhookUrl: parsed.options.webhookUrl ?? null,
    exitOnChange: Boolean(parsed.options.exitOnChange),
  }, cliOptions.jsonOutput);
}

function buildExportInvocation(args, env = process.env, cliOptions = {}) {
  const [target, value] = args;
  if (target === "openapi") {
    if (args.length > 1) {
      return { type: "error", message: "Usage: 402bot export openapi" };
    }
    return withJsonOutput({
      type: "local",
      action: "export_openapi",
      baseUrl: apiBaseUrl(env),
      mcpUrl: mcpBaseUrl(env),
    }, cliOptions.jsonOutput);
  }

  if (target === "mcp-config") {
    const client = value ?? "all";
    if (!["all", "claude", "claude-code", "cursor", "codex", "gemini"].includes(client)) {
      return { type: "error", message: `Unknown mcp-config target: ${client}` };
    }
    return withJsonOutput({
      type: "local",
      action: "export_mcp_config",
      client,
      baseUrl: apiBaseUrl(env),
      remoteMcpBaseUrl: mcpBaseUrl(env),
    }, cliOptions.jsonOutput);
  }

  return { type: "error", message: "Usage: 402bot export <mcp-config|openapi> ..." };
}

function buildChangelogInvocation(args, env = process.env, cliOptions = {}) {
  if (args.length > 0) {
    return { type: "error", message: "changelog does not take positional arguments." };
  }
  return withJsonOutput({
    type: "local",
    action: "changelog",
    baseUrl: apiBaseUrl(env),
  }, cliOptions.jsonOutput);
}

function buildWalletInvocation(args, env = process.env, cliOptions = {}) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "dossier") {
    return withJsonOutput({ type: "proxy", proxyArgs: ["wallet", ...args] }, cliOptions.jsonOutput);
  }

  const parsed = parseOptionArgs(rest, WALLET_DOSSIER_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return {
      type: "error",
      message: "Usage: 402bot wallet dossier <address> [--profile wallet|treasury|defi-risk|prediction-markets|counterparty-map] [--days 30]",
    };
  }

  const address = parsed.positionals[0];
  const profile = parsed.options.profile ?? "wallet";
  const recipe = resolveWalletDossierProfile(profile, parsed.options.days);

  return buildRecipeRunFromInput(recipe.slug, recipe.input(address), env, cliOptions);
}

function buildDocsInvocation(args, env = process.env, cliOptions = {}) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "crawl") {
    return {
      type: "error",
      message: "Usage: 402bot docs crawl <url> [--profile brief|audit|integration-notes] [--scope page|domain|subdomains] [--depth ...] [--limit ...]",
    };
  }

  const parsed = parseOptionArgs(rest, DOCS_CRAWL_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return { type: "error", message: "docs crawl requires exactly one URL." };
  }

  const url = parsed.positionals[0];
  const profile = parsed.options.profile ?? DEFAULT_CRAWL_PROFILE;
  const scope = parsed.options.scope ?? DEFAULT_CRAWL_SCOPE;
  const crawlDefaults = buildDocsCrawlDefaults(profile, scope);

  return buildJsonFetchInvocation(
    `${apiBaseUrl(env)}/v1/alchemist/fetch-transform`,
    "POST",
    {
      sourceId: DEFAULT_CRAWL_SOURCE,
      deliveryFormat: "json",
      params: {
        url,
        pageFormat: "markdown",
        depth: parsed.options.depth ?? crawlDefaults.depth,
        limit: parsed.options.limit ?? crawlDefaults.limit,
        includeExternalLinks: false,
        includeSubdomains: crawlDefaults.includeSubdomains,
      },
    },
    cliOptions,
  );
}

function buildTradeInvocation(args, env = process.env, cliOptions = {}) {
  const [surface, ...rest] = args;
  if (surface !== "polymarket") {
    return {
      type: "error",
      message:
        "Usage: 402bot trade polymarket <market-url|slug|title|token-id> --side buy|sell --size 1 [--outcome yes|no] [--kind market|limit] [--price ...]",
    };
  }

  const parsed = parseOptionArgs(rest, TRADE_POLYMARKET_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length !== 1) {
    return { type: "error", message: "trade polymarket requires one <market-url|slug|title|token-id> positional value." };
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

  return withJsonOutput({
    type: "local",
    action: "trade_polymarket",
    baseUrl: apiBaseUrl(env),
    marketRef: parsed.positionals[0],
    outcome: parsed.options.outcome,
    side: parsed.options.side,
    orderKind,
    price: parsed.options.price,
    size: parsed.options.size,
    amount: parsed.options.amount,
    timeInForce: parsed.options.timeInForce,
    postOnly: Boolean(parsed.options.postOnly),
  }, cliOptions.jsonOutput);
}

function buildPolymarketInvocation(args, env = process.env, cliOptions = {}) {
  const [action, value, ...rest] = args;
  switch (action) {
    case "order":
      return buildFetchInvocation(
        `${apiBaseUrl(env)}/v1/predictions/polymarket/orders`,
        "POST",
        value ? [value, ...rest] : rest,
        cliOptions,
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
        cliOptions,
      );
    default:
      return {
        type: "error",
        message: "Usage: 402bot polymarket <order|performance> ...",
      };
  }
}

function buildInitInvocation(args, env = process.env, cliOptions = {}) {
  const [target, ...rest] = args;
  if (target === "agent") {
    const parsed = parseOptionArgs(rest, INIT_AGENT_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const client = parsed.positionals[0] ?? "all";
    if (!["all", "claude", "claude-code", "cursor", "codex", "gemini"].includes(client)) {
      return { type: "error", message: `Unknown init agent target: ${client}` };
    }

    return withJsonOutput({
      type: "local",
      action: "init_agent",
      client,
      campaignId: parsed.options.campaignId ?? null,
      baseUrl: apiBaseUrl(env),
      remoteMcpBaseUrl: mcpBaseUrl(env),
    }, cliOptions.jsonOutput);
  }

  if (target === "dune") {
    const client = rest[0] ?? "all";
    if (!["all", "claude-code", "cursor", "codex"].includes(client)) {
      return { type: "error", message: `Unknown init dune target: ${client}` };
    }

    const payload = buildInitDunePayload({
      client,
      apiKey: env.DUNE_API_KEY ?? null,
    });
    return withJsonOutput({
      type: "print",
      text: buildInitDuneText(payload),
      data: payload,
    }, cliOptions.jsonOutput);
  }

  if (target === "automation") {
    const scaffoldTarget = rest[0] ?? "github-actions";
    if (!["github-actions", "codex"].includes(scaffoldTarget)) {
      return { type: "error", message: `Unknown init automation target: ${scaffoldTarget}` };
    }
    return withJsonOutput({
      type: "local",
      action: "init_automation",
      scaffoldTarget,
      baseUrl: apiBaseUrl(env),
      remoteMcpBaseUrl: mcpBaseUrl(env),
    }, cliOptions.jsonOutput);
  }

  return {
    type: "error",
    message:
      "Usage: 402bot init agent [claude|claude-code|cursor|codex|gemini|all] [--campaign-id ...]\n" +
      "   or: 402bot init dune [claude-code|cursor|codex|all]\n" +
      "   or: 402bot init automation [github-actions|codex]",
  };
}

function buildRunInvocation(args, env = process.env, cliOptions = {}) {
  const [workflow, ...rest] = args;
  if (!workflow) {
    return {
      type: "error",
      message:
        "Usage: 402bot run <wallet-research|protocol-diligence|market-briefing|dune-analysis|swap-route|jupiter-route|staking-scorecard|lst-rates|lst-premium|cex-dislocation|paraswap-vs-jupiter|crosschain-execution> ...",
    };
  }

  if (workflow === "wallet-research") {
    if (rest.length !== 1) {
      return { type: "error", message: "Usage: 402bot run wallet-research <address>" };
    }
    return buildRecipeRunFromInput("wallet-intel-brief", { walletAddress: rest[0] }, env, cliOptions);
  }

  if (workflow === "protocol-diligence") {
    const parsed = parseOptionArgs(rest, PROTOCOL_DILIGENCE_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 1) {
      return {
        type: "error",
        message: "Usage: 402bot run protocol-diligence <url> [--question ...] [--depth ...] [--limit ...]",
      };
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
      cliOptions,
    );
  }

  if (workflow === "market-briefing") {
    const parsed = parseOptionArgs(rest, MARKET_BRIEFING_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const query = joinPositionals(parsed.positionals);
    if (!query) {
      return {
        type: "error",
        message: 'Usage: 402bot run market-briefing "<topic>" [--min-likes ...] [--min-replies ...] [--hashtags ...]',
      };
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
      cliOptions,
    );
  }

  if (workflow === "dune-analysis") {
    const parsed = parseOptionArgs(rest, DUNE_ANALYSIS_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const question = joinPositionals(parsed.positionals);
    if (!question) {
      return {
        type: "error",
        message: 'Usage: 402bot run dune-analysis "<question>" [--target ...] [--chain ...] [--days ...]',
      };
    }

    return buildRecipeRunFromInput(
      "dune-onchain-brief",
      {
        question,
        ...(parsed.options.target === undefined ? {} : { target: parsed.options.target }),
        ...(parsed.options.chains === undefined ? {} : { chains: parsed.options.chains }),
        ...(parsed.options.days === undefined ? {} : { days: parsed.options.days }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "swap-route") {
    const parsed = parseOptionArgs(rest, SWAP_ROUTE_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 3 || parsed.options.srcDecimals === undefined || parsed.options.destDecimals === undefined) {
      return {
        type: "error",
        message:
          "Usage: 402bot run swap-route <src-token> <dest-token> <amount> --src-decimals <n> --dest-decimals <n> [--network ...] [--side BUY|SELL] [--goal ...]",
      };
    }

    return buildRecipeRunFromInput(
      "paraswap-route-brief",
      {
        srcToken: parsed.positionals[0],
        destToken: parsed.positionals[1],
        amount: parsed.positionals[2],
        srcDecimals: parsed.options.srcDecimals,
        destDecimals: parsed.options.destDecimals,
        ...(parsed.options.network === undefined ? {} : { network: parsed.options.network }),
        ...(parsed.options.side === undefined ? {} : { side: parsed.options.side }),
        ...(parsed.options.goal === undefined ? {} : { goal: parsed.options.goal }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "jupiter-route") {
    const parsed = parseOptionArgs(rest, JUPITER_ROUTE_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 3) {
      return {
        type: "error",
        message:
          "Usage: 402bot run jupiter-route <input-mint> <output-mint> <amount> [--slippage-bps ...] [--swap-mode ExactIn|ExactOut] [--only-direct-routes] [--restrict-intermediate-tokens] [--goal ...]",
      };
    }

    return buildRecipeRunFromInput(
      "jupiter-route-brief",
      {
        inputMint: parsed.positionals[0],
        outputMint: parsed.positionals[1],
        amount: parsed.positionals[2],
        ...(parsed.options.slippageBps === undefined ? {} : { slippageBps: parsed.options.slippageBps }),
        ...(parsed.options.swapMode === undefined ? {} : { swapMode: parsed.options.swapMode }),
        ...(parsed.options.onlyDirectRoutes === undefined ? {} : { onlyDirectRoutes: parsed.options.onlyDirectRoutes }),
        ...(parsed.options.restrictIntermediateTokens === undefined
          ? {}
          : { restrictIntermediateTokens: parsed.options.restrictIntermediateTokens }),
        ...(parsed.options.goal === undefined ? {} : { goal: parsed.options.goal }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "staking-scorecard") {
    const parsed = parseOptionArgs(rest, STAKING_SCORECARD_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const goal = joinPositionals(parsed.positionals);
    if (!goal) {
      return {
        type: "error",
        message: 'Usage: 402bot run staking-scorecard "<goal>" [--protocols ...] [--min-tvl ...] [--limit ...]',
      };
    }

    return buildRecipeRunFromInput(
      "liquid-staking-scorecard",
      {
        goal,
        protocols: parsed.options.protocols ?? DEFAULT_STAKING_SCORECARD_PROTOCOLS,
        ...(parsed.options.minTvlUsd === undefined ? {} : { minTvlUsd: parsed.options.minTvlUsd }),
        ...(parsed.options.limit === undefined ? {} : { limit: parsed.options.limit }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "lst-rates") {
    const parsed = parseOptionArgs(rest, LST_RATE_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const question = parsed.options.question ?? joinPositionals(parsed.positionals);
    return buildRecipeRunFromInput(
      "lst-exchange-rate-watch",
      {
        ...(parsed.options.assets === undefined ? { assets: DEFAULT_LST_RATE_ASSETS } : { assets: parsed.options.assets }),
        ...(question ? { question } : {}),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "lst-premium") {
    const parsed = parseOptionArgs(rest, LST_PREMIUM_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }

    const goal = joinPositionals(parsed.positionals);
    if (!goal) {
      return {
        type: "error",
        message: 'Usage: 402bot run lst-premium "<goal>" [--assets ...] [--protocols ...] [--min-tvl ...] [--limit ...]',
      };
    }

    return buildRecipeRunFromInput(
      "lst-premium-vs-yield-brief",
      {
        goal,
        ...(parsed.options.assets === undefined ? { assets: DEFAULT_LST_RATE_ASSETS } : { assets: parsed.options.assets }),
        ...(parsed.options.protocols === undefined
          ? { protocols: DEFAULT_STAKING_SCORECARD_PROTOCOLS }
          : { protocols: parsed.options.protocols }),
        ...(parsed.options.minTvlUsd === undefined ? {} : { minTvlUsd: parsed.options.minTvlUsd }),
        ...(parsed.options.limit === undefined ? {} : { limit: parsed.options.limit }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "cex-dislocation") {
    const parsed = parseOptionArgs(rest, CEX_DISLOCATION_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 1) {
      return {
        type: "error",
        message:
          "Usage: 402bot run cex-dislocation <base-asset> [--quote-asset ...] [--exchanges ...] [--include-funding] [--question ...]",
      };
    }

    return buildRecipeRunFromInput(
      "cex-dislocation-watch",
      {
        baseAsset: parsed.positionals[0],
        ...(parsed.options.quoteAsset === undefined ? {} : { quoteAsset: parsed.options.quoteAsset }),
        ...(parsed.options.exchanges === undefined ? {} : { exchanges: parsed.options.exchanges }),
        ...(parsed.options.includeFunding === undefined ? {} : { includeFunding: parsed.options.includeFunding }),
        ...(parsed.options.question === undefined ? {} : { question: parsed.options.question }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "crosschain-execution") {
    const parsed = parseOptionArgs(rest, CROSSCHAIN_EXECUTION_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (parsed.positionals.length !== 4) {
      return {
        type: "error",
        message:
          "Usage: 402bot run crosschain-execution <solana-input-query> <solana-output-query> <solana-amount> <cex-base-asset> [--quote-asset ...] [--exchanges ...] [--include-funding] [--slippage-bps ...] [--swap-mode ExactIn|ExactOut] [--goal ...]",
      };
    }

    return buildRecipeRunFromInput(
      "crosschain-execution-board",
      {
        solana: {
          inputQuery: parsed.positionals[0],
          outputQuery: parsed.positionals[1],
          amount: parsed.positionals[2],
          ...(parsed.options.slippageBps === undefined ? {} : { slippageBps: parsed.options.slippageBps }),
          ...(parsed.options.swapMode === undefined ? {} : { swapMode: parsed.options.swapMode }),
        },
        cex: {
          baseAsset: parsed.positionals[3],
          ...(parsed.options.quoteAsset === undefined ? {} : { quoteAsset: parsed.options.quoteAsset }),
          ...(parsed.options.exchanges === undefined ? {} : { exchanges: parsed.options.exchanges }),
          ...(parsed.options.includeFunding === undefined ? {} : { includeFunding: parsed.options.includeFunding }),
        },
        ...(parsed.options.goal === undefined ? {} : { goal: parsed.options.goal }),
      },
      env,
      cliOptions,
    );
  }

  if (workflow === "paraswap-vs-jupiter") {
    const parsed = parseOptionArgs(rest, PARASWAP_VS_JUPITER_OPTION_SPECS);
    if (!parsed.ok) {
      return { type: "error", message: parsed.message };
    }
    if (
      parsed.positionals.length !== 6 ||
      parsed.options.paraswapSrcDecimals === undefined ||
      parsed.options.paraswapDestDecimals === undefined
    ) {
      return {
        type: "error",
        message:
          "Usage: 402bot run paraswap-vs-jupiter <paraswap-src-token> <paraswap-dest-token> <paraswap-amount> <jupiter-input-mint> <jupiter-output-mint> <jupiter-amount> --paraswap-src-decimals <n> --paraswap-dest-decimals <n> [--paraswap-network ...] [--paraswap-side BUY|SELL] [--jupiter-slippage-bps ...] [--jupiter-swap-mode ExactIn|ExactOut] [--jupiter-only-direct-routes] [--jupiter-restrict-intermediate-tokens] [--goal ...]",
      };
    }

    return buildRecipeRunFromInput(
      "paraswap-vs-jupiter-execution-brief",
      {
        paraswap: {
          srcToken: parsed.positionals[0],
          destToken: parsed.positionals[1],
          amount: parsed.positionals[2],
          srcDecimals: parsed.options.paraswapSrcDecimals,
          destDecimals: parsed.options.paraswapDestDecimals,
          ...(parsed.options.paraswapNetwork === undefined ? {} : { network: parsed.options.paraswapNetwork }),
          ...(parsed.options.paraswapSide === undefined ? {} : { side: parsed.options.paraswapSide }),
        },
        jupiter: {
          inputMint: parsed.positionals[3],
          outputMint: parsed.positionals[4],
          amount: parsed.positionals[5],
          ...(parsed.options.jupiterSlippageBps === undefined ? {} : { slippageBps: parsed.options.jupiterSlippageBps }),
          ...(parsed.options.jupiterSwapMode === undefined ? {} : { swapMode: parsed.options.jupiterSwapMode }),
          ...(parsed.options.jupiterOnlyDirectRoutes === undefined
            ? {}
            : { onlyDirectRoutes: parsed.options.jupiterOnlyDirectRoutes }),
          ...(parsed.options.jupiterRestrictIntermediateTokens === undefined
            ? {}
            : { restrictIntermediateTokens: parsed.options.jupiterRestrictIntermediateTokens }),
        },
        ...(parsed.options.goal === undefined ? {} : { goal: parsed.options.goal }),
      },
      env,
      cliOptions,
    );
  }

  return {
    type: "error",
    message:
      `Unknown workflow: ${workflow}\n` +
      "Supported workflows: wallet-research, protocol-diligence, market-briefing, dune-analysis, swap-route, staking-scorecard, cex-dislocation",
  };
}

function buildConfigInvocation(args, cliOptions = {}) {
  const [action, ...rest] = args;
  if (!action || action === "get") {
    const key = rest[0];
    if (rest.length > 1) {
      return { type: "error", message: "config get accepts at most one optional key." };
    }
    if (key && !normalizeConfigKey(key)) {
      return { type: "error", message: `Unknown config key: ${key}` };
    }
    return withJsonOutput({
      type: "local",
      action: "config_get",
      key: key ? normalizeConfigKey(key) : null,
    }, cliOptions.jsonOutput);
  }

  if (action === "set") {
    if (rest.length !== 2) {
      return {
        type: "error",
        message:
          "Usage: 402bot config set <campaign-id|network|spend-cap|spend-cap-per-tx|favorite-wallet|favorite-recipe> <value>",
      };
    }

    const normalizedKey = normalizeConfigKey(rest[0]);
    if (!normalizedKey) {
      return { type: "error", message: `Unknown config key: ${rest[0]}` };
    }
    const parsedValue = parseConfigValue(normalizedKey, rest[1]);
    if (!parsedValue.ok) {
      return { type: "error", message: parsedValue.message };
    }

    return withJsonOutput({
      type: "local",
      action: "config_set",
      key: normalizedKey,
      value: parsedValue.value,
    }, cliOptions.jsonOutput);
  }

  return { type: "error", message: "Usage: 402bot config <get|set> ..." };
}

function buildDoctorInvocation(args, cliOptions = {}) {
  const parsed = parseOptionArgs(args, DOCTOR_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length > 0) {
    return { type: "error", message: "doctor does not take positional arguments." };
  }

  return withJsonOutput({
    type: "local",
    action: "doctor",
    fix: Boolean(parsed.options.fix),
  }, cliOptions.jsonOutput);
}

function buildSpendInvocation(args, cliOptions = {}) {
  const parsed = parseOptionArgs(args, SPEND_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length > 0) {
    return { type: "error", message: "spend does not take positional arguments." };
  }

  return withJsonOutput({
    type: "local",
    action: "spend",
    since: parsed.options.since ?? null,
  }, cliOptions.jsonOutput);
}

function buildHistoryInvocation(args, cliOptions = {}) {
  const parsed = parseOptionArgs(args, HISTORY_OPTION_SPECS);
  if (!parsed.ok) {
    return { type: "error", message: parsed.message };
  }
  if (parsed.positionals.length > 0) {
    return { type: "error", message: "history does not take positional arguments." };
  }

  return withJsonOutput({
    type: "local",
    action: "history",
    since: parsed.options.since ?? null,
    limit: parsed.options.limit ?? DEFAULT_HISTORY_LIMIT,
  }, cliOptions.jsonOutput);
}

function buildCompletionInvocation(args, cliOptions = {}) {
  const shell = args[0];
  if (!shell || !["bash", "zsh"].includes(shell)) {
    return { type: "error", message: "Usage: 402bot completion <bash|zsh>" };
  }
  if (args.length > 1) {
    return { type: "error", message: "completion takes exactly one shell target." };
  }

  const payload = buildCompletionPayload(shell);
  return withJsonOutput({
    type: "print",
    text: payload.script,
    data: payload,
  }, cliOptions.jsonOutput);
}

function buildRecipeRunFromInput(slug, input, env = process.env, cliOptions = {}) {
  return buildJsonFetchInvocation(
    `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}/run`,
    "POST",
    {
      input,
    },
    cliOptions,
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
      body: `claude mcp add-json 402bot '${JSON.stringify({ type: "http", url: remoteUrl })}'`,
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
    schema: "402bot/init-agent/v1",
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

  sections.push("", "Walleted execution still runs through this CLI:");
  for (const command of payload.nextCommands) {
    sections.push(command);
  }

  return sections.join("\n");
}

function buildDuneMcpUrl(apiKey) {
  return `${DEFAULT_DUNE_MCP_URL}?api_key=${encodeURIComponent(apiKey)}`;
}

function buildInitDunePayload({ client, apiKey }) {
  const resolvedApiKey = apiKey?.trim() || "<your-dune-api-key>";
  const remoteMcpUrl = buildDuneMcpUrl(resolvedApiKey);
  const snippets = {
    "claude-code": {
      id: "claude-code",
      title: "Claude Code",
      body: `claude mcp add-json dune_prod '${JSON.stringify({ type: "http", url: remoteMcpUrl })}'`,
    },
    cursor: {
      id: "cursor",
      title: "Cursor",
      body: JSON.stringify({
        mcpServers: {
          dune_prod: {
            url: remoteMcpUrl,
          },
        },
      }, null, 2),
    },
    codex: {
      id: "codex",
      title: "Codex CLI",
      body: [
        `codex mcp add dune_prod --url "${remoteMcpUrl}"`,
        "",
        "[mcp_servers.dune_prod]",
        `url = "${remoteMcpUrl}"`,
        "tool_timeout_sec = 300",
      ].join("\n"),
    },
  };

  const selectedTargets = client === "all" ? ["claude-code", "cursor", "codex"] : [client];

  return {
    schema: "402bot/init-dune/v1",
    apiKey: resolvedApiKey,
    remoteMcpUrl,
    envDefaults: {
      DUNE_API_KEY: resolvedApiKey,
    },
    cliInstallCommand: DUNE_CLI_INSTALL_COMMAND,
    cliAuthCommand: DUNE_AUTH_COMMAND,
    skillsAddCommand: DUNE_SKILLS_ADD_COMMAND,
    clients: selectedTargets.map((target) => ({
      id: snippets[target].id,
      title: snippets[target].title,
      snippet: snippets[target].body,
    })),
    nextCommands: [
      '402bot run dune-analysis "Which contracts paid the most gas on Base over the last 7 days?" --chain base --days 7',
    ],
  };
}

function buildInitDuneText(payload) {
  const sections = [
    "Use your own Dune key for the direct MCP, CLI, and skills lane:",
    "",
    `export DUNE_API_KEY=${payload.envDefaults.DUNE_API_KEY}`,
    "",
    "Install the Dune CLI:",
    payload.cliInstallCommand,
    "",
    "Authenticate:",
    payload.cliAuthCommand,
    "",
    "Install the Dune skill pack:",
    payload.skillsAddCommand,
    "",
    "Remote MCP URL:",
    payload.remoteMcpUrl,
  ];

  for (const client of payload.clients) {
    sections.push("", `${client.title}:`, client.snippet);
  }

  sections.push("", "Use 402.bot for the managed paid workflow:");
  for (const command of payload.nextCommands) {
    sections.push(command);
  }

  return sections.join("\n");
}

function buildInitAutomationPayload(invocation) {
  if (invocation.scaffoldTarget === "github-actions") {
    return {
      schema: "402bot/init-automation/v1",
      target: "github-actions",
      title: "GitHub Actions automation scaffold",
      template: `name: Scheduled 402bot recipe run

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

jobs:
  run-recipe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: npx 402bot recipe run <recipe-slug> --from-file .github/402bot-input.json --wait --save output/recipe.json
        env:
          BOT402_API_URL: ${invocation.baseUrl}
      - uses: actions/upload-artifact@v4
        with:
          name: 402bot-recipe-output
          path: output/recipe.json`,
    };
  }

  return {
    schema: "402bot/init-automation/v1",
    target: "codex",
    title: "Codex automation scaffold",
    template: `::automation-update{mode="suggested create" name="402bot recipe run" prompt="Run the selected 402bot recipe, wait for completion, and summarize the result." rrule="FREQ=HOURLY;INTERVAL=1" cwds="${process.cwd()}" status="ACTIVE"}`,
  };
}

function buildOpenApiExportPayload(invocation) {
  const paths = Object.entries(HTTP_SURFACES).map(([operationId, value]) => ({
    operationId,
    method: value.method,
    path: value.path,
  }));

  paths.push(
    { operationId: "recipe_detail", method: "GET", path: "/v1/recipes/{slug}" },
    { operationId: "provider_directory", method: "GET", path: "/v1/providers" },
    { operationId: "provider_detail", method: "GET", path: "/v1/providers/{slug}" },
  );

  return {
    schema: "402bot/export-openapi/v1",
    baseUrl: invocation.baseUrl,
    mcpUrl: invocation.mcpUrl,
    paths,
  };
}

function buildCompletionPayload(shell) {
  return {
    schema: "402bot/completion/v1",
    shell,
    script: shell === "bash" ? buildBashCompletionScript() : buildZshCompletionScript(),
  };
}

function buildBashCompletionScript() {
  return `# bash completion for 402bot
_402bot() {
  local cur prev words cword
  _init_completion -n : || return

  local commands="setup status wallet config doctor spend history completion mcp discover inspect compare recipe providers market catalog watch export changelog whats-new docs trade polymarket init prompt plan run route route-probe transform fetch-transform fetch-sources materialize recipes"
  local config_keys="campaign-id network spend-cap spend-cap-per-tx favorite-wallet favorite-recipe"
  local shells="bash zsh"
  local wallet_profiles="wallet treasury defi-risk prediction-markets counterparty-map polymarket"
  local docs_profiles="brief audit integration-notes"
  local docs_scopes="page domain subdomains"
  local market_actions="doctor auth status price markets search trending history top-gainers-losers watch tui commands version"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return
  fi

  case "\${words[1]}" in
    config)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "get set" -- "$cur") )
      elif [[ $cword -eq 3 && \${words[2]} == "set" ]]; then
        COMPREPLY=( $(compgen -W "$config_keys" -- "$cur") )
      elif [[ $cword -eq 3 && \${words[2]} == "get" ]]; then
        COMPREPLY=( $(compgen -W "$config_keys" -- "$cur") )
      fi
      ;;
    completion)
      COMPREPLY=( $(compgen -W "$shells" -- "$cur") )
      ;;
    wallet)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "info history export-key dossier" -- "$cur") )
      elif [[ $cword -ge 3 && \${words[2]} == "dossier" ]]; then
        COMPREPLY=( $(compgen -W "$wallet_profiles" -- "$cur") )
      fi
      ;;
    recipe)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "run list search inspect recommend" -- "$cur") )
      fi
      ;;
    providers)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "list search inspect" -- "$cur") )
      fi
      ;;
    market)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$market_actions" -- "$cur") )
      fi
      ;;
    catalog)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "update" -- "$cur") )
      fi
      ;;
    watch)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "wallet endpoint provider" -- "$cur") )
      fi
      ;;
    export)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "mcp-config openapi" -- "$cur") )
      fi
      ;;
    docs)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "crawl" -- "$cur") )
      fi
      ;;
    trade)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "polymarket" -- "$cur") )
      fi
      ;;
    polymarket)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "order performance" -- "$cur") )
      fi
      ;;
    init)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "agent dune automation" -- "$cur") )
      elif [[ $cword -eq 3 ]]; then
        if [[ \${words[2]} == "agent" ]]; then
          COMPREPLY=( $(compgen -W "all claude claude-code cursor codex gemini" -- "$cur") )
        elif [[ \${words[2]} == "dune" ]]; then
          COMPREPLY=( $(compgen -W "all claude-code cursor codex" -- "$cur") )
        elif [[ \${words[2]} == "automation" ]]; then
          COMPREPLY=( $(compgen -W "github-actions codex" -- "$cur") )
        fi
      fi
      ;;
    run)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "wallet-research protocol-diligence market-briefing dune-analysis swap-route jupiter-route staking-scorecard lst-rates lst-premium cex-dislocation paraswap-vs-jupiter crosschain-execution" -- "$cur") )
      fi
      ;;
  esac
}

complete -F _402bot 402bot`;
}

function buildZshCompletionScript() {
  return `#compdef 402bot

local -a commands
commands=(
  'setup:configure a wallet and proxy defaults'
  'status:show proxy status'
  'wallet:wallet operations'
  'config:manage 402bot defaults'
  'doctor:verify local setup and remote reachability'
  'spend:summarize wallet spend history'
  'history:show wallet history'
  'completion:print shell completions'
  'mcp:start the remote MCP bridge'
  'discover:discover live APIs for a goal'
  'inspect:inspect an endpoint or agent'
  'compare:compare a shortlist for a goal'
  'recipe:list search or run recipes'
  'providers:list search or inspect providers'
  'market:delegate CoinGecko CLI market commands'
  'catalog:update local catalog snapshots'
  'watch:poll wallet, endpoint, or provider state'
  'export:print integration exports'
  'changelog:compare cached and live catalog state'
  'whats-new:alias for changelog'
  'docs:run docs crawl wrappers'
  'trade:trade wrappers'
  'polymarket:polymarket analytics or raw orders'
  'init:print agent config snippets'
  'prompt:emit the exact next calls for a goal'
  'plan:emit an execution plan'
  'run:run named workflows'
)

if (( CURRENT == 2 )); then
  _describe 'command' commands
  return
fi

case "$words[2]" in
  config)
    if (( CURRENT == 3 )); then
      _describe 'config action' 'get:get values' 'set:set a value'
    elif [[ "$words[3]" == "set" || "$words[3]" == "get" ]]; then
      _describe 'config key' \
        'campaign-id:default campaign id for MCP installs' \
        'network:default preferred payment network' \
        'spend-cap:daily USDC spend cap' \
        'spend-cap-per-tx:per-transaction USDC spend cap' \
        'favorite-wallet:favored wallet address' \
        'favorite-recipe:favored recipe slug'
    fi
    ;;
  completion)
    _describe 'shell' 'bash:bash completion script' 'zsh:zsh completion script'
    ;;
  wallet)
    if (( CURRENT == 3 )); then
      _describe 'wallet action' \
        'info:show wallet info' \
        'history:show upstream wallet history' \
        'export-key:export a private key' \
        'dossier:run a dossier recipe'
    fi
    ;;
  recipe)
    if (( CURRENT == 3 )); then
      _describe 'recipe action' 'run:run a recipe' 'list:list recipes' 'search:search recipes' 'inspect:inspect one recipe' 'recommend:recommend recipes'
    fi
    ;;
  providers)
    if (( CURRENT == 3 )); then
      _describe 'provider action' 'list:list providers' 'search:search providers' 'inspect:inspect one provider'
    fi
    ;;
  market)
    if (( CURRENT == 3 )); then
      _describe 'market action' \
        'doctor:check local CoinGecko CLI availability' \
        'auth:configure CoinGecko CLI auth' \
        'status:show CoinGecko auth status' \
        'price:get live prices' \
        'markets:list top market-cap coins' \
        'search:search coins' \
        'trending:show trending coins, nfts, and categories' \
        'history:get historical coin data' \
        'top-gainers-losers:show top movers' \
        'watch:stream live prices' \
        'tui:launch CoinGecko terminal UI' \
        'commands:print CoinGecko machine-readable command catalog' \
        'version:print CoinGecko CLI version'
    fi
    ;;
  catalog)
    if (( CURRENT == 3 )); then
      _describe 'catalog action' 'update:refresh cached catalog data'
    fi
    ;;
  watch)
    if (( CURRENT == 3 )); then
      _describe 'watch target' 'wallet:watch a wallet' 'endpoint:watch an endpoint' 'provider:watch a provider'
    fi
    ;;
  export)
    if (( CURRENT == 3 )); then
      _describe 'export target' 'mcp-config:print MCP client config' 'openapi:print public HTTP surface map'
    fi
    ;;
  docs)
    if (( CURRENT == 3 )); then
      _describe 'docs action' 'crawl:crawl documentation'
    fi
    ;;
  trade)
    if (( CURRENT == 3 )); then
      _describe 'trade surface' 'polymarket:place a polymarket order'
    fi
    ;;
  init)
    if (( CURRENT == 3 )); then
      _describe 'init target' 'agent:print agent snippets' 'dune:print Dune setup snippets' 'automation:print automation scaffolds'
    elif (( CURRENT == 4 )); then
      if [[ "$words[3]" == "agent" ]]; then
        _describe 'agent client' \
          'all:print all supported clients' \
          'claude:Claude Desktop' \
          'claude-code:Claude Code' \
          'cursor:Cursor' \
          'codex:Codex CLI' \
          'gemini:Gemini CLI'
      elif [[ "$words[3]" == "dune" ]]; then
        _describe 'dune client' \
          'all:print all supported clients' \
          'claude-code:Claude Code' \
          'cursor:Cursor' \
          'codex:Codex CLI'
      elif [[ "$words[3]" == "automation" ]]; then
        _describe 'automation scaffold' \
          'github-actions:scheduled GitHub Actions workflow' \
          'codex:Codex automation scaffold'
      fi
    fi
    ;;
  run)
    if (( CURRENT == 3 )); then
      _describe 'workflow' \
        'wallet-research:wallet dossier brief' \
        'protocol-diligence:protocol diligence pack' \
        'market-briefing:prediction market radar' \
        'dune-analysis:Dune onchain brief' \
        'swap-route:ParaSwap route brief' \
        'jupiter-route:Jupiter route brief' \
        'staking-scorecard:liquid staking scorecard' \
        'lst-rates:LST exchange-rate watch' \
        'lst-premium:LST premium vs yield brief' \
        'cex-dislocation:CEX dislocation watch' \
        'paraswap-vs-jupiter:cross-venue execution brief' \
        'crosschain-execution:Jupiter plus CEX execution board'
    fi
    ;;
esac`;
}

function resolveWalletDossierProfile(profile, days) {
  switch (profile) {
    case "wallet":
      return {
        slug: "wallet-intel-brief",
        input: (walletAddress) => ({ walletAddress }),
      };
    case "treasury":
      return {
        slug: "treasury-risk-watch",
        input: (walletAddress) => ({ walletAddress }),
      };
    case "defi-risk":
      return {
        slug: "wallet-stablecoin-liquidity-brief",
        input: (walletAddress) => ({ walletAddress }),
      };
    case "prediction-markets":
    case "polymarket":
      return {
        slug: "polymarket-wallet-dossier",
        input: (walletAddress) => ({
          walletAddress,
          days: days ?? DEFAULT_POLYMARKET_PROFILE_DAYS,
        }),
      };
    case "counterparty-map":
      return {
        slug: "wallet-counterparty-map",
        input: (walletAddress) => ({
          walletAddress,
          window: daysToCounterpartyWindow(days),
        }),
      };
    default:
      return {
        slug: "wallet-intel-brief",
        input: (walletAddress) => ({ walletAddress }),
      };
  }
}

function daysToCounterpartyWindow(days) {
  if (!days || days > 1) {
    return "7d";
  }
  return "24h";
}

function buildDocsCrawlDefaults(profile, scope) {
  const base =
    profile === "audit"
      ? { depth: 3, limit: 20 }
      : profile === "integration-notes"
        ? { depth: 2, limit: 12 }
        : { depth: 1, limit: 6 };

  if (scope === "page") {
    return {
      ...base,
      depth: 1,
      limit: 1,
      includeSubdomains: false,
    };
  }

  return {
    ...base,
    includeSubdomains: scope === "subdomains",
  };
}

export function buildUsage() {
  return [
    "Usage: 402bot <command> [options]",
    "",
    "Wallet and setup:",
    "  402bot setup",
    "  402bot status",
    "  402bot doctor",
    "  402bot wallet [subcommand]",
    "  402bot wallet dossier <address> --profile treasury",
    "",
    "Config and history:",
    "  402bot config get",
    "  402bot config set campaign-id codex-mcp-setup",
    "  402bot config set spend-cap 2",
    "  402bot spend --since 7d",
    "  402bot history --since 7d --json",
    "  402bot completion zsh",
    "",
    "Discovery and operator flows:",
    '  402bot discover "find the best live Base wallet-intelligence or risk API for an autonomous trading agent"',
    '  402bot discover "best Base treasury API" --max-price 0.02 --freshness 6h --trust observed --requires-mcp',
    "  402bot inspect <endpoint-id-or-agent-address>",
    '  402bot compare "find the best live Base weather or risk API for a DeFi agent"',
    "  402bot recipe list",
    '  402bot recipe search "polymarket"',
    "  402bot recipe inspect dune-onchain-brief",
    '  402bot recipe recommend "best treasury watch workflow"',
    "  402bot providers list",
    '  402bot providers search "dune"',
    "  402bot providers inspect dune",
    "  402bot market doctor",
    "  402bot market price --ids bitcoin",
    "  402bot --json market markets --category layer-2 --total 25",
    "  402bot market commands",
    '  402bot ag0 search "wallet-risk"',
    "  402bot ag0 inspect 42",
    "  402bot ag0 dossier 42",
    "  402bot catalog update",
    "  402bot recipes sync",
    "  402bot changelog",
    '  402bot prompt "find the best live Base treasury monitoring API"',
    '  402bot plan "monitor this wallet for treasury and prediction-market risk"',
    "  402bot watch provider dune --once",
    "  402bot export mcp-config codex",
    "  402bot export openapi",
    "  402bot discover ... --json",
    "  402bot inspect ... --json",
    "  402bot compare ... --json",
    "",
    "Paid execution:",
    "  402bot mcp --campaign-id defi-agent-alpha",
    "  402bot docs crawl https://docs.uniswap.org --profile integration-notes --scope subdomains --depth 2",
    "  402bot trade polymarket 12345 --side buy --size 5",
    "  402bot trade polymarket https://polymarket.com/event/example --outcome yes --side buy --size 5",
    "  402bot run wallet-research 0x1111111111111111111111111111111111111111",
    "  402bot run protocol-diligence https://docs.uniswap.org --question 'What are the obvious diligence gaps?'",
    '  402bot run market-briefing "Polymarket election odds"',
    '  402bot run dune-analysis "Which contracts paid the most gas on Base over the last 7 days?" --chain base --days 7',
    "  402bot run swap-route 0x4200000000000000000000000000000000000006 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 1000000000000000000 --src-decimals 18 --dest-decimals 6 --network 8453",
    "  402bot run jupiter-route So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --slippage-bps 50",
    '  402bot run staking-scorecard "Compare liquid staking options for a conservative ETH treasury"',
    "  402bot run lst-rates --assets wsteth,reth,cbeth,weeth,sfrxeth --question 'Which LST exchange rates deserve monitoring?'",
    '  402bot run lst-premium "Which ETH LSTs look mature enough for treasury collateral?" --assets wsteth,reth,cbeth,weeth,sfrxeth',
    "  402bot run cex-dislocation BTC --quote-asset USDT --include-funding",
    "  402bot run paraswap-vs-jupiter 0x4200000000000000000000000000000000000006 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 1000000000000000000 So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 1000000000 --paraswap-src-decimals 18 --paraswap-dest-decimals 6",
    "  402bot run crosschain-execution SOL USDC 1000000000 SOL --quote-asset USDT --include-funding",
    '  402bot recipe run wallet-intel-brief --body \'{"input":{"walletAddress":"0x..."}}\'',
    '  402bot recipe run wallet-intel-brief --from-file ./input.json --wait --save ./output.json',
    '  402bot fetch-transform --body \'{"sourceId":"cloudflare_crawl","params":{"url":"https://docs.uniswap.org"}}\'',
    "",
    "Agent setup:",
    "  402bot init agent",
    "  402bot init agent codex --campaign-id codex-mcp-setup",
    "  402bot init dune codex",
    "  402bot init automation github-actions",
    "  402bot doctor --fix",
    "",
    "Environment:",
    `  BOT402_API_URL defaults to ${DEFAULT_API_BASE_URL}`,
    `  BOT402_MCP_URL defaults to ${DEFAULT_MCP_URL}`,
    "  BOT402_CG_BIN can override the local CoinGecko CLI binary path",
    `  DUNE_API_KEY configures direct Dune installs for ${DEFAULT_DUNE_MCP_URL}`,
    "",
    "This CLI delegates wallet setup, payment handling, and payment settlement to x402-proxy.",
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

  if (command === "setup") {
    return buildSetupInvocation(rest, cliOptions);
  }

  if (command === "status") {
    return withJsonOutput({ type: "proxy", proxyArgs: ["status", ...rest] }, cliOptions.jsonOutput);
  }

  if (command === "wallet") {
    return buildWalletInvocation(rest, env, cliOptions);
  }

  if (command === "config") {
    return buildConfigInvocation(rest, cliOptions);
  }

  if (command === "doctor") {
    return buildDoctorInvocation(rest, cliOptions);
  }

  if (command === "spend") {
    return buildSpendInvocation(rest, cliOptions);
  }

  if (command === "history") {
    return buildHistoryInvocation(rest, cliOptions);
  }

  if (command === "completion") {
    return buildCompletionInvocation(rest, cliOptions);
  }

  if (command === "mcp") {
    return buildMcpInvocation(rest, env, cliOptions);
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

  if (command === "providers") {
    return buildProvidersInvocation(rest, env, cliOptions);
  }

  if (command === "market") {
    return buildMarketInvocation(rest, env, cliOptions);
  }

  if (command === "ag0") {
    return buildAg0Invocation(rest, env, cliOptions);
  }

  if (command === "catalog") {
    return buildCatalogInvocation(rest, env, cliOptions);
  }

  if (command === "watch") {
    return buildWatchInvocation(rest, env, cliOptions);
  }

  if (command === "export") {
    return buildExportInvocation(rest, env, cliOptions);
  }

  if (command === "changelog" || command === "whats-new") {
    return buildChangelogInvocation(rest, env, cliOptions);
  }

  if (command === "docs") {
    return buildDocsInvocation(rest, env, cliOptions);
  }

  if (command === "trade") {
    return buildTradeInvocation(rest, env, cliOptions);
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
    return buildRunInvocation(rest, env, cliOptions);
  }

  if (command === "polymarket") {
    return buildPolymarketInvocation(rest, env, cliOptions);
  }

  if (command === "recipes" && rest[0] === "sync") {
    return buildCatalogInvocation(["update"], env, cliOptions);
  }

  const surface = HTTP_SURFACES[command];
  if (surface) {
    return buildFetchInvocation(`${apiBaseUrl(env)}${surface.path}`, surface.method, rest, cliOptions);
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
    const binEntry = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.["x402-proxy"];
    if (!binEntry) {
      throw new Error("x402-proxy package.json does not expose a bin entry.");
    }
    const candidate = resolve(dirname(packageJsonPath), binEntry);
    if (existsSync(candidate)) {
      return {
        command: process.execPath,
        args: [candidate],
        source: "dependency",
      };
    }
  } catch {
    // Fall through to the shell PATH.
  }

  return {
    command: "x402-proxy",
    args: [],
    source: "path",
  };
}

function resolveCoinGeckoCliCommand(env = process.env) {
  const configured = env.BOT402_CG_BIN?.trim();
  return configured && configured.length > 0 ? configured : "cg";
}

function checkCoinGeckoCliAvailability(env = process.env) {
  const command = resolveCoinGeckoCliCommand(env);
  const result = spawnSync(command, ["--version"], {
    env,
    stdio: "pipe",
    encoding: "utf8",
    timeout: 5000,
  });

  const stdout = result.stdout?.trim() ?? "";
  return {
    available: !result.error && (result.status ?? 1) === 0,
    command,
    version: stdout || null,
    ...(result.error ? { error: result.error.message } : {}),
    ...(result.status !== undefined ? { exitCode: result.status } : {}),
  };
}

function hasCoinGeckoOutputFlag(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-o" || arg === "--output") {
      return true;
    }
    if (arg.startsWith("--output=") || arg.startsWith("-o=")) {
      return true;
    }
  }
  return false;
}

function coinGeckoArgsUseJsonOutput(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if ((arg === "-o" || arg === "--output") && args[index + 1] === "json") {
      return true;
    }
    if (arg === "--output=json" || arg === "-o=json") {
      return true;
    }
  }
  return false;
}

function isCoinGeckoInteractiveCommand(action, args, jsonOutput) {
  if (action === "tui") {
    return true;
  }
  if (action === "watch") {
    return !jsonOutput && !coinGeckoArgsUseJsonOutput(args);
  }
  return false;
}

function buildCoinGeckoInstallHint(command = "cg") {
  return [
    `Install ${command} with one of:`,
    "  brew install coingecko/coingecko-cli/cg",
    "  curl -sSfL https://raw.githubusercontent.com/coingecko/coingecko-cli/main/install.sh | sh",
  ].join("\n");
}

async function applyRuntimeDefaults(invocation, env = process.env) {
  if (!invocation || invocation.type === "help" || invocation.type === "error") {
    return invocation;
  }

  const { load402botConfig } = await loadRuntime();
  const botConfig = load402botConfig(env);

  if (invocation.type === "proxy" && invocation.proxyArgs[0] === "mcp" && botConfig.campaignId) {
    const next = { ...invocation, proxyArgs: [...invocation.proxyArgs] };
    const lastIndex = next.proxyArgs.length - 1;
    const remoteUrl = next.proxyArgs[lastIndex];
    try {
      const url = new URL(remoteUrl);
      if (!url.searchParams.has("campaignId")) {
        url.searchParams.set("campaignId", botConfig.campaignId);
        next.proxyArgs[lastIndex] = url.toString();
      }
    } catch {
      // Ignore malformed custom URLs and leave the invocation untouched.
    }
    return next;
  }

  if (invocation.type === "local") {
    const next = { ...invocation };
    if (next.useConfiguredNetworkDefault && botConfig.network) {
      next.network = botConfig.network;
    }
    if (next.action === "init_agent" && !next.campaignId && botConfig.campaignId) {
      next.campaignId = botConfig.campaignId;
    }
    return next;
  }

  return invocation;
}

async function requestJson(url, { method = "GET", jsonBody, headers, signal } = {}) {
  const mergedHeaders = {
    accept: "application/json",
    ...(headers ?? {}),
  };
  const init = {
    method,
    headers: mergedHeaders,
    signal,
  };

  if (jsonBody !== undefined) {
    mergedHeaders["content-type"] = "application/json";
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

async function runProxyArgs(proxyArgs, env = process.env, options = {}) {
  const proxyBin = resolveProxyBin();
  const useOverlay = options.useOverlay !== false;
  const captureStdout = Boolean(options.captureStdout);
  const runtime = useOverlay ? await loadRuntime() : null;
  const overlay = useOverlay ? runtime.createProxyOverlay(env) : null;
  const childEnv = overlay?.env ?? env;

  try {
    const child = spawn(proxyBin.command, [...proxyBin.args, ...proxyArgs], {
      stdio: captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
      env: childEnv,
    });

    return await new Promise((resolvePromise, reject) => {
      let stdout = "";

      if (captureStdout) {
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
      }

      child.on("error", reject);
      child.on("exit", (code, signal) => {
        resolvePromise({
          exitCode: signal ? 1 : (code ?? 0),
          stdout,
        });
      });
    });
  } finally {
    overlay?.cleanup();
  }
}

async function runExternalCommand(command, args, env = process.env, options = {}) {
  const captureStdout = Boolean(options.captureStdout);
  const captureStderr = Boolean(options.captureStderr);
  const child = spawn(command, args, {
    stdio: [
      "inherit",
      captureStdout ? "pipe" : "inherit",
      captureStderr ? "pipe" : "inherit",
    ],
    env,
  });

  return await new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";

    if (captureStdout) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }

    if (captureStderr) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolvePromise({
        exitCode: signal ? 1 : (code ?? 0),
        stdout,
        stderr,
      });
    });
  });
}

async function executeHttpInvocation(invocation) {
  const payload = await requestJson(invocation.url, {
    method: invocation.method,
    jsonBody: invocation.jsonBody,
  });

  const output = invocation.jsonOutput
    ? stringifyJson(buildStableHttpPayload(invocation.format, payload, invocation.meta))
    : formatInvocationPayload(invocation.format, payload, invocation.meta);

  return {
    exitCode: 0,
    output,
  };
}

async function executeLocalInvocation(invocation, env = process.env) {
  switch (invocation.action) {
    case "setup":
      return executeSetupAction(invocation, env);
    case "discover_goal":
      return executeDiscoverGoalAction(invocation, env);
    case "inspect_endpoint":
      return executeInspectEndpointAction(invocation);
    case "inspect_agent":
      return executeInspectAgentAction(invocation);
    case "compare_goal":
      return executeCompareGoalAction(invocation);
    case "prompt_goal":
      return executePromptGoalAction(invocation);
    case "plan_goal":
      return executePlanGoalAction(invocation);
    case "recipe_run":
      return executeRecipeRunAction(invocation, env);
    case "recipe_recommend":
      return executeRecipeRecommendAction(invocation);
    case "providers_directory":
      return executeProvidersDirectoryAction(invocation);
    case "market_doctor":
      return executeMarketDoctorAction(invocation, env);
    case "market_passthrough":
      return executeMarketPassthroughAction(invocation, env);
    case "catalog_update":
      return executeCatalogUpdateAction(invocation, env);
    case "config_get":
      return executeConfigGetAction(invocation, env);
    case "config_set":
      return executeConfigSetAction(invocation, env);
    case "doctor":
      return executeDoctorAction(invocation, env);
    case "spend":
      return executeSpendAction(invocation, env);
    case "history":
      return executeHistoryAction(invocation, env);
    case "init_agent":
      return executeInitAgentAction(invocation, env);
    case "init_automation":
      return executeInitAutomationAction(invocation);
    case "trade_polymarket":
      return executeTradePolymarketAction(invocation, env);
    case "watch":
      return executeWatchAction(invocation);
    case "export_mcp_config":
      return executeExportMcpConfigAction(invocation, env);
    case "export_openapi":
      return executeExportOpenApiAction(invocation);
    case "changelog":
      return executeChangelogAction(invocation, env);
    default:
      throw new Error(`Unsupported local action: ${invocation.action}`);
  }
}

async function executeSetupAction(invocation, env = process.env) {
  const result = await runProxyArgs(["setup", ...invocation.setupArgs], env, {
    useOverlay: false,
    captureStdout: false,
  });

  if (result.exitCode !== 0) {
    return result;
  }

  const doctorPayload = await buildDoctorPayload(env);
  const payload = {
    schema: "402bot/setup/v1",
    setupCompleted: true,
    readyToSpend: doctorPayload.wallet.readyToSpend,
    doctor: doctorPayload,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatSetupPayload(payload),
  };
}

async function executeDiscoverGoalAction(invocation) {
  const discoverLimit = Math.min(50, Math.max(10, invocation.limit * 4));
  const initial = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: invocation.network,
    strategy: invocation.strategy,
    limit: discoverLimit,
    ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
  });

  const filters = normalizeDiscoverFilters(invocation.filters);
  const excludedEndpointIds = new Set(initial.results.map((entry) => entry.endpointId));
  const scanned = [...initial.results];
  const filtered = [];
  let continuationRequests = 0;

  for (const entry of initial.results) {
    if (matchesDiscoverFilters(entry, filters)) {
      filtered.push(entry);
    }
  }

  while (
    filtered.length < invocation.limit &&
    initial.sessionId &&
    continuationRequests < 4 &&
    excludedEndpointIds.size < (initial.totalCandidates ?? excludedEndpointIds.size)
  ) {
    const continuation = await requestContinueDiscoverySession(invocation.baseUrl, {
      sessionId: initial.sessionId,
      capability: initial.resolvedCapability,
      network: invocation.network,
      strategy: invocation.strategy,
      limit: discoverLimit,
      excludeEndpointIds: [...excludedEndpointIds],
    });

    continuationRequests += 1;
    if (!continuation.results.length) {
      break;
    }

    for (const entry of continuation.results) {
      excludedEndpointIds.add(entry.endpointId);
      scanned.push(entry);
      if (matchesDiscoverFilters(entry, filters)) {
        filtered.push(entry);
      }
    }
  }

  const deduped = dedupeDiscoverResults(filtered).slice(0, invocation.limit);
  const payload = {
    schema: "402bot/discover/v1",
    goal: invocation.goal,
    requested: {
      network: invocation.network,
      strategy: invocation.strategy,
      limit: invocation.limit,
      ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
    },
    filters,
    sessionId: initial.sessionId ?? initial.requestId ?? null,
    resolvedCapability: initial.resolvedCapability,
    matchedCapabilities: initial.matchedCapabilities ?? [],
    relatedCapabilities: initial.relatedCapabilities ?? [],
    totalCandidates: initial.totalCandidates ?? scanned.length,
    scannedCandidates: scanned.length,
    filteredCandidates: filtered.length,
    continuationRequests,
    results: deduped,
    suggestedNext: (initial.suggestedNext ?? []).map((entry) =>
      buildSuggestedActionPayload(entry, invocation.goal, invocation.baseUrl)
    ),
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatDiscoverPayload(payload),
  };
}

async function executeInspectEndpointAction(invocation) {
  const analytics = await requestJson(
    buildUrlWithQuery(`${invocation.baseUrl}/analytics/endpoint/${encodeURIComponent(invocation.endpointId)}`, {
      days: invocation.days,
    }),
  );

  const verdict = computeEndpointVerdict(analytics);
  const payload = {
    schema: "402bot/inspect-endpoint/v1",
    target: invocation.endpointId,
    verdict,
    summary: buildEndpointVerdictSummary(analytics, verdict),
    analytics,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatEndpointInspectionPayload(payload),
  };
}

async function executeInspectAgentAction(invocation) {
  const analytics = await requestJson(
    buildUrlWithQuery(`${invocation.baseUrl}/analytics/agent/${encodeURIComponent(invocation.address)}`, {
      days: invocation.days,
      network: invocation.network,
    }),
  );

  const verdict = computeAgentVerdict(analytics);
  const payload = {
    schema: "402bot/inspect-agent/v1",
    target: invocation.address,
    verdict,
    summary: buildAgentVerdictSummary(analytics, verdict),
    analytics,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatAgentInspectionPayload(payload),
  };
}

async function executeCompareGoalAction(invocation) {
  const discoverPayload = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: invocation.network,
    strategy: invocation.strategy,
    limit: Math.max(4, invocation.limit),
    ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
  });

  const endpointIds = discoverPayload.results.slice(0, Math.max(2, invocation.limit)).map((entry) => entry.endpointId);
  if (endpointIds.length < 2) {
    const payload = buildCompareGoalPayload(invocation.goal, discoverPayload, null);
    return {
      exitCode: 0,
      output: invocation.jsonOutput ? stringifyJson(payload) : formatCompareGoalPayload(payload),
    };
  }

  const comparePayload = await requestCompareEndpoints(invocation.baseUrl, {
    endpointIds,
    days: invocation.days,
  });
  const payload = buildCompareGoalPayload(invocation.goal, discoverPayload, comparePayload);
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatCompareGoalPayload(payload),
  };
}

async function executePromptGoalAction(invocation) {
  const discoverPayload = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: invocation.network,
    strategy: invocation.strategy,
    limit: invocation.limit,
    ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
  });

  const payload = buildPromptPlanPayload(invocation.goal, discoverPayload, invocation.baseUrl);
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatPromptPlan(payload),
  };
}

async function executePlanGoalAction(invocation) {
  const discoverPayload = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: invocation.network,
    strategy: invocation.strategy,
    limit: Math.max(3, invocation.limit),
    ...(invocation.budgetUsdc === undefined ? {} : { budgetUsdc: invocation.budgetUsdc }),
  });

  const endpointIds = discoverPayload.results.slice(0, Math.max(2, invocation.limit)).map((entry) => entry.endpointId);
  const comparePayload = endpointIds.length >= 2
    ? await requestCompareEndpoints(invocation.baseUrl, {
        endpointIds,
        days: invocation.days,
      })
    : null;

  const payload = buildExecutionPlanPayload(invocation.goal, discoverPayload, comparePayload, invocation.baseUrl);
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatExecutionPlan(payload),
  };
}

async function executeRecipeRunAction(invocation, env = process.env) {
  let proxyArgs = [...invocation.forwardedArgs];

  if (invocation.fromFile) {
    const raw = readFileSync(invocation.fromFile, "utf8");
    proxyArgs = replaceOrAppendBodyArg(proxyArgs, raw);
  }

  const result = await runProxyArgs([
    "--method",
    "POST",
    "--header",
    "Content-Type: application/json",
    ...proxyArgs,
    `${invocation.baseUrl}/v1/recipes/${encodeURIComponent(invocation.slug)}/run`,
  ], env, {
    useOverlay: true,
    captureStdout: true,
  });

  if (result.exitCode !== 0) {
    return result;
  }

  const rawOutput = result.stdout.trim();
  const parsed = tryParseJson(rawOutput);
  const inspectionUrl = extractInspectionUrl(parsed);
  const finalPayload = invocation.wait && inspectionUrl
    ? await waitForRecipeRunCompletion(invocation.baseUrl, inspectionUrl)
    : parsed;

  if (invocation.savePath) {
    const { save402botTextFile } = await loadRuntime();
    save402botTextFile(
      invocation.savePath,
      typeof finalPayload === "string" ? finalPayload : stringifyJson(finalPayload ?? parsed ?? rawOutput),
    );
  }

  const openResult = invocation.open ? await attemptOpenUrl(inspectionUrl) : null;
  const payload = {
    schema: "402bot/recipe-run/v1",
    slug: invocation.slug,
    inspectionUrl: inspectionUrl ?? null,
    waited: Boolean(invocation.wait && inspectionUrl),
    savedTo: invocation.savePath,
    opened: openResult?.ok ?? false,
    openMessage: openResult?.message ?? null,
    result: finalPayload ?? parsed ?? rawOutput,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatRecipeRunPayload(payload),
  };
}

async function executeRecipeRecommendAction(invocation) {
  const discover = await requestDiscoverGoal(invocation.baseUrl, {
    goal: invocation.goal,
    network: DEFAULT_NETWORK,
    strategy: "balanced",
    limit: 20,
  });

  const directMatches = (discover.results ?? [])
    .filter((entry) => entry.endpointId?.startsWith("recipe-"))
    .map((entry) => ({
      slug: entry.endpointId.slice("recipe-".length),
      reason: entry.reasons?.[0] ?? "Resolved as a live recipe candidate via discovery.",
      score: entry.score ?? null,
      priceUsdc: entry.priceUsdc ?? null,
      resource: entry.resource ?? null,
    }));

  const search = directMatches.length > 0
    ? { totalRecipes: directMatches.length, results: [] }
    : await requestJson(
      buildUrlWithQuery(`${invocation.baseUrl}/v1/recipes/search`, {
        q: invocation.goal,
        limit: DEFAULT_RECIPE_LIMIT,
        sort: DEFAULT_RECIPE_SORT,
      }),
    );

  const fallbackMatches = directMatches.length > 0
    ? []
    : (search.results ?? []).map((entry) => ({
        slug: entry.recipe.slug,
        displayName: entry.recipe.displayName,
        summary: entry.recipe.summary,
        priceUsdc: entry.recipe.priceUsdc,
        capabilities: entry.recipe.capabilities ?? [],
        resource: `${invocation.baseUrl}/v1/recipes/${encodeURIComponent(entry.recipe.slug)}/run`,
        reason: "Matched the recipe search index for this goal.",
      }));

  const payload = {
    schema: "402bot/recipe-recommend/v1",
    goal: invocation.goal,
    resolvedCapability: discover.resolvedCapability ?? null,
    recommendations: directMatches.length > 0 ? directMatches : fallbackMatches,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatRecipeRecommendPayload(payload),
  };
}

async function executeProvidersDirectoryAction(invocation) {
  const payload = await requestJson(`${invocation.baseUrl}/v1/providers`);
  const query = invocation.query?.trim().toLowerCase() ?? null;
  const filtered = (payload.results ?? []).filter((entry) => {
    if (invocation.recommendation && entry.readiness?.recommendation !== invocation.recommendation) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      entry.provider?.slug,
      entry.provider?.displayName,
      entry.provider?.description,
      entry.provider?.homepage,
      ...(entry.provider?.capabilities ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  }).slice(0, invocation.limit);

  const response = {
    schema: "402bot/providers-directory/v1",
    mode: invocation.mode,
    query: invocation.query,
    totalProviders: payload.totalProviders ?? payload.results?.length ?? filtered.length,
    results: filtered.map(normalizeProviderDirectoryEntry),
  };
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(response) : formatProvidersDirectoryPayload(response),
  };
}

async function executeMarketDoctorAction(invocation, env = process.env) {
  const availability = checkCoinGeckoCliAvailability(env);
  let statusOutput = null;

  if (availability.available) {
    const status = await runExternalCommand(availability.command, ["status"], env, {
      captureStdout: true,
      captureStderr: true,
    });
    statusOutput = (status.stdout || status.stderr || "").trim() || null;
  }

  const payload = {
    schema: "402bot/market-doctor/v1",
    marketCli: {
      ...availability,
      statusOutput,
      installHint: buildCoinGeckoInstallHint(invocation.command),
      supportedCommands: [...COINGECKO_ALLOWED_COMMANDS].filter((entry) => !entry.startsWith("-")),
    },
  };

  if (invocation.jsonOutput) {
    return {
      exitCode: availability.available ? 0 : 1,
      output: stringifyJson(payload),
    };
  }

  const lines = [
    `CoinGecko CLI: ${availability.available ? "available" : "missing"}`,
    `Command: ${availability.command}`,
    availability.version ? `Version: ${availability.version}` : null,
    statusOutput ? `Status: ${statusOutput}` : null,
    !availability.available ? "" : null,
    !availability.available ? buildCoinGeckoInstallHint(invocation.command) : null,
  ].filter(Boolean);

  return {
    exitCode: availability.available ? 0 : 1,
    output: lines.join("\n"),
  };
}

async function executeMarketPassthroughAction(invocation, env = process.env) {
  const availability = checkCoinGeckoCliAvailability(env);
  if (!availability.available) {
    throw new Error(
      `CoinGecko CLI is not available from ${availability.command}.\n${buildCoinGeckoInstallHint(invocation.command)}`,
    );
  }

  const finalArgs = [...invocation.forwardedArgs];
  if (
    invocation.jsonOutput &&
    COINGECKO_JSON_OUTPUT_COMMANDS.has(invocation.marketAction) &&
    !hasCoinGeckoOutputFlag(finalArgs)
  ) {
    finalArgs.push("-o", "json");
  }

  const interactive = isCoinGeckoInteractiveCommand(invocation.marketAction, finalArgs, invocation.jsonOutput);
  const result = await runExternalCommand(availability.command, finalArgs, env, {
    captureStdout: !interactive,
    captureStderr: !interactive,
  });

  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(detail || `CoinGecko CLI exited with code ${result.exitCode}.`);
  }

  if (interactive) {
    return { exitCode: 0, output: "" };
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    return { exitCode: 0, output: "" };
  }

  if (invocation.jsonOutput) {
    if (COINGECKO_INTRINSIC_JSON_COMMANDS.has(invocation.marketAction) || coinGeckoArgsUseJsonOutput(finalArgs)) {
      return { exitCode: 0, output: stdout };
    }

    return {
      exitCode: 0,
      output: stringifyJson({
        schema: "402bot/market-passthrough/v1",
        command: availability.command,
        args: finalArgs,
        stdout,
      }),
    };
  }

  return {
    exitCode: 0,
    output: stdout,
  };
}

async function executeCatalogUpdateAction(invocation, env = process.env) {
  const latest = await fetchCatalogState(invocation.baseUrl);
  const { get402botCatalogSnapshotPath, get402botLlmsFullPath, get402botLlmsPath, load402botJsonFile, save402botJsonFile, save402botTextFile } =
    await loadRuntime();
  const previous = load402botJsonFile(get402botCatalogSnapshotPath(env), null);
  const diff = buildCatalogDiff(previous, latest);

  save402botJsonFile(get402botCatalogSnapshotPath(env), latest);
  save402botTextFile(get402botLlmsPath(env), latest.llmsText);
  save402botTextFile(get402botLlmsFullPath(env), latest.llmsFullText);

  const payload = {
    schema: "402bot/catalog-update/v1",
    updatedAt: latest.generatedAt,
    cacheUpdated: true,
    cachePath: get402botCatalogSnapshotPath(env),
    recipes: latest.recipes.totalRecipes,
    providers: latest.providers.totalProviders,
    llms: {
      llmsPath: get402botLlmsPath(env),
      llmsFullPath: get402botLlmsFullPath(env),
    },
    diff,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatCatalogUpdatePayload(payload),
  };
}

async function executeConfigGetAction(invocation, env = process.env) {
  const payload = await buildConfigPayload(env);
  const response = invocation.key
    ? {
        schema: "402bot/config-get/v1",
        key: invocation.key,
        value: payload.config[invocation.key] ?? null,
        paths: payload.paths,
      }
    : payload;

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(response) : formatConfigPayload(response),
  };
}

async function executeConfigSetAction(invocation, env = process.env) {
  const { load402botConfig, save402botConfig, get402botConfigPath } = await loadRuntime();
  const current = load402botConfig(env);
  const updated = save402botConfig(
    {
      ...current,
      [invocation.key]: invocation.value,
    },
    env,
  );

  const payload = {
    schema: "402bot/config-set/v1",
    updatedKey: invocation.key,
    value: invocation.value,
    config: updated,
    paths: {
      configPath: get402botConfigPath(env),
    },
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatConfigSetPayload(payload),
  };
}

async function executeDoctorAction(invocation, env = process.env) {
  let fixes = [];
  if (invocation.fix) {
    fixes = await applyDoctorFixes(env);
  }
  const payload = await buildDoctorPayload(env);
  if (invocation.fix) {
    payload.fix = {
      attempted: true,
      applied: fixes,
    };
  }
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatDoctorPayload(payload),
  };
}

async function executeSpendAction(invocation, env = process.env) {
  const { readHistory, parseTimeWindowSpec, filterHistorySince, summarizeHistory, calcSpend } = await loadRuntime();
  const allRecords = readHistory(env);
  const since = invocation.since ? parseTimeWindowSpec(invocation.since) : null;
  const filteredRecords = filterHistorySince(allRecords, since);
  const payload = {
    schema: "402bot/spend/v1",
    window: buildTimeWindowPayload(since),
    summary: summarizeHistory(filteredRecords),
    lifetime: calcSpend(allRecords),
    recent: filteredRecords.slice(-5).reverse().map(normalizeHistoryRecord),
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatSpendPayload(payload),
  };
}

async function executeHistoryAction(invocation, env = process.env) {
  const { readHistory, parseTimeWindowSpec, filterHistorySince, summarizeHistory } = await loadRuntime();
  const allRecords = readHistory(env);
  const since = invocation.since ? parseTimeWindowSpec(invocation.since) : null;
  const filteredRecords = filterHistorySince(allRecords, since);
  const payload = {
    schema: "402bot/history/v1",
    window: buildTimeWindowPayload(since),
    summary: summarizeHistory(filteredRecords),
    records: filteredRecords.slice(-invocation.limit).reverse().map(normalizeHistoryRecord),
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatHistoryPayload(payload),
  };
}

async function executeInitAgentAction(invocation, env = process.env) {
  const payload = buildInitAgentPayload({
    client: invocation.client,
    campaignId: invocation.campaignId,
    env: {
      ...env,
      BOT402_API_URL: invocation.baseUrl,
      BOT402_MCP_URL: invocation.remoteMcpBaseUrl,
    },
  });

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : buildInitAgentText(payload),
  };
}

async function executeInitAutomationAction(invocation) {
  const payload = buildInitAutomationPayload(invocation);
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatInitAutomationPayload(payload),
  };
}

async function executeExportMcpConfigAction(invocation, env = process.env) {
  const payload = buildInitAgentPayload({
    client: invocation.client,
    campaignId: null,
    env: {
      ...env,
      BOT402_API_URL: invocation.baseUrl,
      BOT402_MCP_URL: invocation.remoteMcpBaseUrl,
    },
  });
  const response = {
    schema: "402bot/export-mcp-config/v1",
    client: invocation.client,
    remoteMcpUrl: payload.remoteMcpUrl,
    clients: payload.clients,
  };
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(response) : formatExportMcpConfigPayload(response),
  };
}

async function executeExportOpenApiAction(invocation) {
  const payload = buildOpenApiExportPayload(invocation);
  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatExportOpenApiPayload(payload),
  };
}

async function executeWatchAction(invocation) {
  const intervalWindow = parseTimeWindowSpecLike(invocation.interval);
  const timeoutWindow = parseTimeWindowSpecLike(invocation.timeout);
  const start = Date.now();
  const initialSnapshot = await fetchWatchSnapshot(invocation);
  const events = [buildWatchEvent("initial", initialSnapshot)];
  let current = initialSnapshot;
  let webhookDeliveries = [];

  if (!invocation.once) {
    while (Date.now() - start < (timeoutWindow?.ms ?? 0)) {
      await delay(intervalWindow?.ms ?? 30000);
      const next = await fetchWatchSnapshot(invocation);
      if (next.hash !== current.hash) {
        const event = buildWatchEvent("changed", next, current);
        events.push(event);
        if (invocation.webhookUrl) {
          webhookDeliveries.push(await sendWatchWebhook(invocation.webhookUrl, event));
        }
        current = next;
        if (invocation.exitOnChange) {
          break;
        }
      }
    }
  }

  const payload = {
    schema: "402bot/watch/v1",
    targetType: invocation.targetType,
    targetValue: invocation.targetValue,
    interval: invocation.interval,
    timeout: invocation.timeout,
    once: invocation.once,
    webhookUrl: invocation.webhookUrl,
    deliveries: webhookDeliveries,
    events,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatWatchPayload(payload),
  };
}

async function executeChangelogAction(invocation, env = process.env) {
  const latest = await fetchCatalogState(invocation.baseUrl);
  const { get402botCatalogSnapshotPath, load402botJsonFile } = await loadRuntime();
  const previous = load402botJsonFile(get402botCatalogSnapshotPath(env), null);
  const diff = buildCatalogDiff(previous, latest);
  const payload = {
    schema: "402bot/changelog/v1",
    comparedAt: latest.generatedAt,
    hasBaseline: Boolean(previous),
    diff,
  };

  return {
    exitCode: 0,
    output: invocation.jsonOutput ? stringifyJson(payload) : formatChangelogPayload(payload),
  };
}

async function executeTradePolymarketAction(invocation, env = process.env) {
  const resolution = await resolvePolymarketTarget(invocation.marketRef, invocation.outcome);
  const proxyArgs = [
    "--method",
    "POST",
    "--header",
    "Content-Type: application/json",
    "--body",
    JSON.stringify({
      tokenId: resolution.tokenId,
      side: invocation.side,
      orderKind: invocation.orderKind,
      ...(invocation.price === undefined ? {} : { price: invocation.price }),
      ...(invocation.size === undefined ? {} : { size: invocation.size }),
      ...(invocation.amount === undefined ? {} : { amount: invocation.amount }),
      ...(invocation.timeInForce === undefined ? {} : { timeInForce: invocation.timeInForce }),
      ...(invocation.postOnly ? { postOnly: true } : {}),
    }),
    `${invocation.baseUrl}/v1/predictions/polymarket/orders`,
  ];

  const result = await runProxyArgs(proxyArgs, env, {
    useOverlay: true,
    captureStdout: true,
  });

  if (result.exitCode !== 0) {
    return result;
  }

  const rawOutput = result.stdout.trim();
  const parsedOutput = tryParseJson(rawOutput) ?? rawOutput;
  if (invocation.jsonOutput) {
    return {
      exitCode: 0,
      output: stringifyJson({
        schema: "402bot/trade-polymarket/v1",
        request: {
          marketRef: invocation.marketRef,
          resolvedTokenId: resolution.tokenId,
          side: invocation.side,
          orderKind: invocation.orderKind,
          outcome: resolution.outcome ?? null,
          ...(invocation.price === undefined ? {} : { price: invocation.price }),
          ...(invocation.size === undefined ? {} : { size: invocation.size }),
          ...(invocation.amount === undefined ? {} : { amount: invocation.amount }),
        },
        resolution,
        result: parsedOutput,
      }),
    };
  }

  const lines = [];
  lines.push(`Resolved market: ${resolution.title ?? invocation.marketRef}`);
  if (resolution.outcome) {
    lines.push(`Resolved outcome: ${resolution.outcome}`);
  }
  if (resolution.defaultedOutcome) {
    lines.push("Outcome defaulted to YES. Pass --outcome to override.");
  }
  if (rawOutput) {
    lines.push("", rawOutput);
  }

  return {
    exitCode: 0,
    output: lines.join("\n"),
  };
}

async function buildDoctorPayload(env = process.env) {
  const {
    buildMergedProxyConfig,
    fetchEvmBalances,
    fetchSolanaBalances,
    get402botConfigDir,
    get402botConfigPath,
    getX402ProxyConfigDir,
    getX402ProxyHistoryPath,
    getX402ProxyWalletPath,
    load402botConfig,
    resolveWallet,
  } = await loadRuntime();
  const botConfig = load402botConfig(env);
  const proxyMerged = buildMergedProxyConfig(env);
  const wallet = resolveWallet(env);
  const proxy = checkProxyAvailability(env);
  const marketCli = checkCoinGeckoCliAvailability(env);
  const apiHealth = await checkHttpReachability(`${apiBaseUrl(env)}/healthz`, {
    method: "GET",
  });
  const mcpHealth = await checkHttpReachability(
    buildRemoteMcpUrl(mcpBaseUrl(env), botConfig.campaignId),
    { method: "OPTIONS" },
  );

  const baseRpc = await probeBaseRpc(wallet.evmAddress);
  const solanaRpc = await probeSolanaRpc(wallet.solanaAddress);

  const readyToSpend = {
    base: Boolean(wallet.evmAddress) && Boolean(baseRpc.ok) && isPositiveNumber(baseRpc.balances?.eth) && isPositiveNumber(baseRpc.balances?.usdc),
    solana:
      Boolean(wallet.solanaAddress) &&
      Boolean(solanaRpc.ok) &&
      isPositiveNumber(solanaRpc.balances?.sol) &&
      isPositiveNumber(solanaRpc.balances?.usdc),
  };

  const warnings = [];
  if (!wallet.evmAddress && !wallet.solanaAddress) {
    warnings.push("No wallet is configured.");
  }
  if (wallet.evmAddress && !readyToSpend.base) {
    warnings.push("Base wallet is configured but not funded for spend now.");
  }
  if (wallet.solanaAddress && !readyToSpend.solana) {
    warnings.push("Solana wallet is configured but not funded for spend now.");
  }
  if (!proxy.available) {
    warnings.push("x402-proxy is not executable from this install.");
  }
  if (!apiHealth.ok) {
    warnings.push("The public 402.bot API is not reachable.");
  }
  if (!mcpHealth.ok) {
    warnings.push("The remote MCP URL is not reachable.");
  }

  return {
    schema: "402bot/doctor/v1",
    status:
      warnings.length === 0 ? "ok"
      : warnings.some((entry) => /not reachable|not executable|No wallet/i.test(entry)) ? "warn"
      : "warn",
    warnings,
    config: {
      botConfig,
      mergedProxyConfig: {
        defaultNetwork: proxyMerged.mergedConfig.defaultNetwork ?? null,
        spendLimitDaily: proxyMerged.mergedConfig.spendLimitDaily ?? null,
        spendLimitPerTx: proxyMerged.mergedConfig.spendLimitPerTx ?? null,
      },
      paths: {
        botConfigDir: get402botConfigDir(env),
        botConfigPath: get402botConfigPath(env),
        x402ProxyConfigDir: getX402ProxyConfigDir(env),
        x402ProxyWalletPath: getX402ProxyWalletPath(env),
        x402ProxyHistoryPath: getX402ProxyHistoryPath(env),
      },
    },
    proxy,
    marketCli,
    api: apiHealth,
    mcp: {
      ...mcpHealth,
      remoteUrl: buildRemoteMcpUrl(mcpBaseUrl(env), botConfig.campaignId),
      campaignId: botConfig.campaignId ?? null,
    },
    wallet: {
      source: wallet.source,
      evmAddress: wallet.evmAddress ?? null,
      solanaAddress: wallet.solanaAddress ?? null,
      readyToSpend,
      base: baseRpc,
      solana: solanaRpc,
    },
  };
}

function checkProxyAvailability(env = process.env) {
  const proxyBin = resolveProxyBin();
  if (proxyBin.source === "dependency") {
    return {
      available: true,
      source: proxyBin.source,
      command: [proxyBin.command, ...proxyBin.args].join(" "),
    };
  }

  const result = spawnSync(proxyBin.command, ["--help"], {
    env,
    stdio: "pipe",
    encoding: "utf8",
    timeout: 5000,
  });

  return {
    available: !result.error && (result.status ?? 1) === 0,
    source: proxyBin.source,
    command: proxyBin.command,
    ...(result.error ? { error: result.error.message } : {}),
    ...(result.status !== undefined ? { exitCode: result.status } : {}),
  };
}

async function checkHttpReachability(url, { method = "GET" } = {}) {
  try {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(DEFAULT_DOCTOR_TIMEOUT_MS),
    });
    return {
      ok: response.status < 500,
      statusCode: response.status,
      statusText: response.statusText,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeBaseRpc(address) {
  try {
    if (address) {
      const { fetchEvmBalances } = await loadRuntime();
      const balances = await fetchEvmBalances(address, { signal: AbortSignal.timeout(DEFAULT_DOCTOR_TIMEOUT_MS) });
      return {
        ok: true,
        rpcUrl: BASE_RPC_URL,
        balances,
      };
    }

    const payload = await requestJson(BASE_RPC_URL, {
      method: "POST",
      jsonBody: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
      signal: AbortSignal.timeout(DEFAULT_DOCTOR_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
      },
    });

    return {
      ok: Boolean(payload?.result),
      rpcUrl: BASE_RPC_URL,
      latestBlock: payload?.result ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      rpcUrl: BASE_RPC_URL,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeSolanaRpc(address) {
  try {
    if (address) {
      const { fetchSolanaBalances } = await loadRuntime();
      const balances = await fetchSolanaBalances(address, { signal: AbortSignal.timeout(DEFAULT_DOCTOR_TIMEOUT_MS) });
      return {
        ok: true,
        rpcUrl: SOLANA_RPC_URL,
        balances,
      };
    }

    const payload = await requestJson(SOLANA_RPC_URL, {
      method: "POST",
      jsonBody: {
        jsonrpc: "2.0",
        id: 1,
        method: "getVersion",
        params: [],
      },
      signal: AbortSignal.timeout(DEFAULT_DOCTOR_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
      },
    });

    return {
      ok: Boolean(payload?.result),
      rpcUrl: SOLANA_RPC_URL,
      version: payload?.result ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      rpcUrl: SOLANA_RPC_URL,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

async function requestContinueDiscoverySession(baseUrl, body) {
  return requestJson(`${baseUrl}/v1/discover/continue`, {
    method: "POST",
    jsonBody: body,
  });
}

async function fetchAllRecipes(baseUrl) {
  return requestJson(buildUrlWithQuery(`${baseUrl}/v1/recipes`, {
    limit: 200,
    sort: DEFAULT_RECIPE_SORT,
  }));
}

async function fetchAllProviders(baseUrl) {
  return requestJson(`${baseUrl}/v1/providers`);
}

async function fetchCatalogState(baseUrl) {
  const [recipes, providers, llmsText, llmsFullText] = await Promise.all([
    fetchAllRecipes(baseUrl),
    fetchAllProviders(baseUrl),
    fetch(LLMS_URL).then((response) => response.text()),
    fetch(LLMS_FULL_URL).then((response) => response.text()),
  ]);

  return {
    schema: "402bot/catalog-state/v1",
    generatedAt: new Date().toISOString(),
    recipes: buildRecipeDirectoryJsonPayload(recipes, { mode: "list" }),
    providers: {
      totalProviders: providers.totalProviders ?? providers.results?.length ?? 0,
      results: (providers.results ?? []).map(normalizeProviderDirectoryEntry),
    },
    llmsText,
    llmsFullText,
  };
}

function buildCatalogDiff(previous, latest) {
  const previousRecipes = new Map((previous?.recipes?.results ?? []).map((entry) => [entry.slug, entry]));
  const latestRecipes = new Map((latest?.recipes?.results ?? []).map((entry) => [entry.slug, entry]));
  const previousProviders = new Map((previous?.providers?.results ?? []).map((entry) => [entry.slug, entry]));
  const latestProviders = new Map((latest?.providers?.results ?? []).map((entry) => [entry.slug, entry]));

  return {
    recipes: buildEntityDiff(previousRecipes, latestRecipes, compareRecipeEntries),
    providers: buildEntityDiff(previousProviders, latestProviders, compareProviderEntries),
  };
}

function buildEntityDiff(previousMap, latestMap, compare) {
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, value] of latestMap.entries()) {
    if (!previousMap.has(key)) {
      added.push(value);
      continue;
    }
    const delta = compare(previousMap.get(key), value);
    if (delta) {
      changed.push({ key, ...delta });
    }
  }

  for (const [key, value] of previousMap.entries()) {
    if (!latestMap.has(key)) {
      removed.push(value);
    }
  }

  return { added, removed, changed };
}

function parseRecipeRunArgs(args) {
  const positionals = [];
  const forwardedArgs = [];
  const options = {
    wait: false,
    open: false,
    savePath: null,
    fromFile: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--wait") {
      options.wait = true;
      continue;
    }
    if (arg === "--open") {
      options.open = true;
      continue;
    }
    if (arg === "--save") {
      const value = args[index + 1];
      if (!value) {
        return { ok: false, message: "--save requires a value." };
      }
      options.savePath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--save=")) {
      options.savePath = arg.slice("--save=".length);
      continue;
    }
    if (arg === "--from-file") {
      const value = args[index + 1];
      if (!value) {
        return { ok: false, message: "--from-file requires a value." };
      }
      options.fromFile = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--from-file=")) {
      options.fromFile = arg.slice("--from-file=".length);
      continue;
    }
    if (positionals.length === 0 && !arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    forwardedArgs.push(arg);
    if (!arg.includes("=") && flagRequiresValue(arg)) {
      const value = args[index + 1];
      if (value !== undefined) {
        forwardedArgs.push(value);
        index += 1;
      }
    }
  }

  return { ok: true, positionals, forwardedArgs, options };
}

function compareRecipeEntries(previous, latest) {
  const changes = [];
  if (previous.priceUsdc !== latest.priceUsdc) {
    changes.push("price");
  }
  if (previous.summary !== latest.summary) {
    changes.push("summary");
  }
  if (JSON.stringify(previous.capabilities ?? []) !== JSON.stringify(latest.capabilities ?? [])) {
    changes.push("capabilities");
  }
  return changes.length ? { slug: latest.slug, displayName: latest.displayName, changes } : null;
}

function compareProviderEntries(previous, latest) {
  const changes = [];
  if (previous.recommendation !== latest.recommendation) {
    changes.push("recommendation");
  }
  if (previous.readinessSummary !== latest.readinessSummary) {
    changes.push("readiness");
  }
  if (previous.endpointCount !== latest.endpointCount) {
    changes.push("endpointCount");
  }
  return changes.length ? { slug: latest.slug, displayName: latest.displayName, changes } : null;
}

function stripParsedOptionArgs(args, optionSpecs) {
  const flagMap = new Map();
  for (const spec of optionSpecs) {
    for (const flag of spec.flags) {
      flagMap.set(flag, spec);
    }
  }

  const preserved = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const baseFlag = arg.includes("=") ? arg.split("=")[0] : arg;
    const spec = flagMap.get(baseFlag);
    if (!spec) {
      preserved.push(arg);
      continue;
    }
    if (spec.type !== "boolean" && !arg.includes("=")) {
      index += 1;
    }
  }
  return preserved;
}

function replaceOrAppendBodyArg(args, body) {
  const next = [...args];
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] === "--body") {
      next[index + 1] = body;
      return next;
    }
    if (next[index].startsWith("--body=")) {
      next[index] = `--body=${body}`;
      return next;
    }
  }
  next.push("--body", body);
  return next;
}

function extractInspectionUrl(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload.inspectionUrl ?? payload.run?.inspectionUrl ?? payload.result?.inspectionUrl ?? null;
}

async function waitForRecipeRunCompletion(baseUrl, inspectionUrl) {
  const resolvedUrl = inspectionUrl.startsWith("http") ? inspectionUrl : `${baseUrl}${inspectionUrl}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await requestJson(resolvedUrl);
    const status = payload.run?.status ?? payload.status ?? null;
    if (status && !["queued", "running", "pending"].includes(status)) {
      return payload;
    }
    await delay(2000);
  }
  return requestJson(resolvedUrl);
}

async function attemptOpenUrl(url) {
  if (!url) {
    return { ok: false, message: "No inspection URL was returned to open." };
  }
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(command, [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return { ok: true, message: `Opened ${url}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function applyDoctorFixes(env = process.env) {
  const { load402botConfig, resolveWallet, save402botConfig } = await loadRuntime();
  const current = load402botConfig(env);
  const wallet = resolveWallet(env);
  const next = { ...current };
  const applied = [];

  if (!next.network) {
    next.network = DEFAULT_NETWORK;
    applied.push("Set default network to Base.");
  }
  if (!next.favoriteRecipe) {
    next.favoriteRecipe = "wallet-intel-brief";
    applied.push("Set favorite recipe to wallet-intel-brief.");
  }
  if (!next.favoriteWallet && wallet.evmAddress) {
    next.favoriteWallet = wallet.evmAddress;
    applied.push("Set favorite wallet from the configured Base wallet.");
  }

  if (applied.length > 0) {
    save402botConfig(next, env);
  }
  return applied;
}

async function fetchWatchSnapshot(invocation) {
  if (invocation.targetType === "provider") {
    const payload = buildProviderDetailJsonPayload(await requestJson(`${invocation.baseUrl}/v1/providers/${encodeURIComponent(invocation.targetValue)}`));
    return {
      targetType: invocation.targetType,
      targetValue: invocation.targetValue,
      summary: `${payload.provider?.displayName ?? invocation.targetValue} is ${payload.readiness?.recommendation ?? "unknown"}.`,
      payload,
      hash: JSON.stringify(payload),
    };
  }

  if (invocation.targetType === "endpoint") {
    const payload = {
      schema: "402bot/inspect-endpoint/v1",
      analytics: await requestJson(buildUrlWithQuery(`${invocation.baseUrl}/analytics/endpoint/${encodeURIComponent(invocation.targetValue)}`, {
        days: timeWindowToLookbackDays(invocation.since),
      })),
    };
    return {
      targetType: invocation.targetType,
      targetValue: invocation.targetValue,
      summary: `${invocation.targetValue} trust ${payload.analytics?.trustProfile?.status ?? "n/a"} with ${payload.analytics?.payments?.totalPaymentCount ?? 0} payments.`,
      payload,
      hash: JSON.stringify(payload),
    };
  }

  const payload = {
    schema: "402bot/inspect-agent/v1",
    analytics: await requestJson(buildUrlWithQuery(`${invocation.baseUrl}/analytics/agent/${encodeURIComponent(invocation.targetValue)}`, {
      days: timeWindowToLookbackDays(invocation.since),
      network: DEFAULT_NETWORK,
    })),
  };
  return {
    targetType: invocation.targetType,
    targetValue: invocation.targetValue,
    summary: `${invocation.targetValue} has ${payload.analytics?.payments?.totalPaymentCount ?? 0} payments and ${payload.analytics?.oracleUsage?.totalPaidRouteRequests ?? 0} paid route requests.`,
    payload,
    hash: JSON.stringify(payload),
  };
}

function buildWatchEvent(type, snapshot, previous = null) {
  return {
    type,
    detectedAt: new Date().toISOString(),
    targetType: snapshot.targetType,
    targetValue: snapshot.targetValue,
    summary: previous ? `${previous.summary} -> ${snapshot.summary}` : snapshot.summary,
    current: snapshot.payload,
    previous: previous?.payload ?? null,
  };
}

async function sendWatchWebhook(url, event) {
  try {
    await requestJson(url, {
      method: "POST",
      jsonBody: event,
      headers: {
        "content-type": "application/json",
      },
    });
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function timeWindowToLookbackDays(value) {
  const window = value ? parseTimeWindowSpecLike(value) : null;
  if (!window) {
    return DEFAULT_LOOKBACK_DAYS;
  }
  return Math.max(1, Math.ceil(window.ms / (24 * 60 * 60 * 1000)));
}

function delay(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function normalizeDiscoverFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function matchesDiscoverFilters(entry, filters = {}) {
  if (filters.maxPriceUsdc !== undefined && (typeof entry.priceUsdc !== "number" || entry.priceUsdc > filters.maxPriceUsdc)) {
    return false;
  }

  if (filters.freshness) {
    const freshnessWindow = parseTimeWindowSpecLike(filters.freshness);
    const maxFreshnessSeconds = freshnessWindow ? Math.round(freshnessWindow.ms / 1000) : null;
    if (maxFreshnessSeconds === null || entry.dataFreshnessSeconds === null || entry.dataFreshnessSeconds > maxFreshnessSeconds) {
      return false;
    }
  }

  if (filters.trust) {
    const trustClass = classifyDiscoverTrust(entry);
    const order = { experimental: 0, observed: 1, verified: 2 };
    if (order[trustClass] < order[filters.trust]) {
      return false;
    }
  }

  if (filters.provider) {
    const haystack = [
      entry.endpointId,
      entry.resource,
      entry.mcpServerName,
      entry.mcpHomepage,
      entry.payTo,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(String(filters.provider).toLowerCase())) {
      return false;
    }
  }

  if (filters.requiresMcp !== undefined) {
    const requiresMcp = Boolean(entry.mcpServerName || entry.mcpSourceType || entry.mcpHomepage);
    if (requiresMcp !== filters.requiresMcp) {
      return false;
    }
  }

  if (filters.asset) {
    const value = String(filters.asset).toLowerCase();
    const matchesAsset = entry.asset?.toLowerCase() === value || entry.assetAddress?.toLowerCase() === value;
    if (!matchesAsset) {
      return false;
    }
  }

  return true;
}

function dedupeDiscoverResults(results) {
  const byEndpointId = new Map();
  for (const entry of results) {
    if (!byEndpointId.has(entry.endpointId)) {
      byEndpointId.set(entry.endpointId, entry);
    }
  }
  return [...byEndpointId.values()];
}

function buildPromptPlanPayload(goal, discoverPayload, baseUrl) {
  return {
    schema: "402bot/prompt/v1",
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
  const shortlist = comparePayload?.endpoints
    ? buildCompareShortlist(comparePayload.endpoints, discoverPayload)
    : [];

  return {
    schema: "402bot/compare/v1",
    goal,
    resolvedCapability: discoverPayload.resolvedCapability,
    selectedEndpointIds: discoverPayload.results.slice(0, DEFAULT_COMPARE_LIMIT).map((entry) => entry.endpointId),
    discover: discoverPayload,
    compare: comparePayload,
    shortlist,
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
    schema: "402bot/plan/v1",
    goal,
    resolvedCapability: discoverPayload.resolvedCapability,
    discover: discoverPayload,
    compare: comparePayload,
    recommendation,
    nextSteps: sourceActions.map((entry) => buildSuggestedActionPayload(entry, goal, baseUrl)),
  };
}

function buildCompareShortlist(compareEntries, discoverPayload) {
  const discoverMap = new Map(discoverPayload.results.map((entry) => [entry.endpointId, entry]));
  const commerceRawValues = compareEntries.map((entry) => (entry.totalPayments ?? 0) * 2 + (entry.totalRouteSelections ?? 0));
  const maxCommerceRaw = Math.max(0, ...commerceRawValues);
  const prices = compareEntries.map((entry) => discoverMap.get(entry.endpoint.endpointId)?.priceUsdc ?? entry.endpoint.priceUsdc ?? 0);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);

  return compareEntries.map((entry) => {
    const discoverEntry = discoverMap.get(entry.endpoint.endpointId);
    const price = discoverEntry?.priceUsdc ?? entry.endpoint.priceUsdc ?? 0;
    const commerceRaw = (entry.totalPayments ?? 0) * 2 + (entry.totalRouteSelections ?? 0);
    const priceScore = maxPrice === minPrice ? 100 : ((maxPrice - price) / (maxPrice - minPrice)) * 100;
    const freshnessScore = computeFreshnessScore(entry.latestProbeAt);
    const commerceScore = maxCommerceRaw === 0 ? 0 : (commerceRaw / maxCommerceRaw) * 100;
    const trustScore = clampScore(entry.trustScore ?? 0);
    const composite = (priceScore + freshnessScore + commerceScore + trustScore) / 4;

    return {
      endpointId: entry.endpoint.endpointId,
      resource: entry.endpoint.resource,
      recommendation: normalizeEndpointRecommendation(entry.recommendation),
      securityStatus: entry.securityStatus,
      priceUsdc: price,
      totalPayments: entry.totalPayments ?? 0,
      totalRouteSelections: entry.totalRouteSelections ?? 0,
      latestProbeAt: entry.latestProbeAt,
      lastHealthyAt: entry.lastHealthyAt,
      scoreBreakdown: {
        price: roundScore(priceScore),
        trust: roundScore(trustScore),
        freshness: roundScore(freshnessScore),
        observedCommerce: roundScore(commerceScore),
        composite: roundScore(composite),
      },
    };
  }).sort((left, right) => right.scoreBreakdown.composite - left.scoreBreakdown.composite);
}

function buildStableHttpPayload(format, payload, meta = {}) {
  switch (format) {
    case "recipes":
      return buildRecipeDirectoryJsonPayload(payload, meta);
    case "recipe_detail":
      return buildRecipeDetailJsonPayload(payload);
    case "provider_detail":
      return buildProviderDetailJsonPayload(payload);
    default:
      return payload;
  }
}

function buildRecipeDirectoryJsonPayload(payload, meta = {}) {
  return {
    schema: "402bot/recipe-directory/v1",
    mode: meta.mode ?? "list",
    query: meta.query ?? null,
    totalRecipes: payload.totalRecipes ?? 0,
    nextCursor: payload.nextCursor ?? null,
    results: (payload.results ?? []).map((entry) => ({
      slug: entry.recipe.slug,
      displayName: entry.recipe.displayName,
      summary: entry.recipe.summary,
      priceUsdc: entry.recipe.priceUsdc,
      capabilities: entry.recipe.capabilities ?? [],
      cluster: entry.marketplace?.cluster ?? null,
      owner: entry.owner?.displayName ?? entry.owner?.creatorId ?? null,
      qualityScore: entry.stats?.qualityScore ?? null,
      freshnessScore: entry.stats?.freshnessScore ?? null,
    })),
  };
}

function buildRecipeDetailJsonPayload(payload) {
  return {
    schema: "402bot/recipe-detail/v1",
    recipe: payload.recipe,
    stats: payload.stats ?? null,
    creator: payload.creator ?? payload.owner ?? null,
    marketplace: payload.marketplace ?? payload.recipe?.metadata?.marketplace ?? null,
  };
}

function buildProviderDetailJsonPayload(payload) {
  return {
    schema: "402bot/provider-detail/v1",
    provider: payload.provider,
    readiness: payload.readiness ?? null,
    endpoints: payload.endpoints ?? [],
    telemetry: payload.telemetry ?? null,
    relatedRecipes: payload.relatedRecipes ?? [],
    profileUrl: payload.profileUrl ?? null,
    share: payload.share ?? null,
  };
}

async function buildConfigPayload(env = process.env) {
  const {
    buildMergedProxyConfig,
    get402botConfigDir,
    get402botConfigPath,
    getX402ProxyConfigDir,
    getX402ProxyHistoryPath,
    getX402ProxyWalletPath,
    load402botConfig,
  } = await loadRuntime();
  const botConfig = load402botConfig(env);
  const merged = buildMergedProxyConfig(env);
  return {
    schema: "402bot/config/v1",
    config: botConfig,
    mergedProxyConfig: {
      defaultNetwork: merged.mergedConfig.defaultNetwork ?? null,
      spendLimitDaily: merged.mergedConfig.spendLimitDaily ?? null,
      spendLimitPerTx: merged.mergedConfig.spendLimitPerTx ?? null,
    },
    paths: {
      configPath: get402botConfigPath(env),
      configDir: get402botConfigDir(env),
      x402ProxyConfigDir: getX402ProxyConfigDir(env),
      x402ProxyWalletPath: getX402ProxyWalletPath(env),
      x402ProxyHistoryPath: getX402ProxyHistoryPath(env),
    },
  };
}

function formatInvocationPayload(format, payload, meta = {}) {
  switch (format) {
    case "recipes":
      return formatRecipeDirectoryPayload(buildRecipeDirectoryJsonPayload(payload, meta), meta);
    case "recipe_detail":
      return formatRecipeDetailPayload(buildRecipeDetailJsonPayload(payload));
    case "provider_detail":
      return formatProviderDetailPayload(buildProviderDetailJsonPayload(payload));
    default:
      return JSON.stringify(payload, null, 2);
  }
}

function formatDiscoverPayload(payload) {
  const lines = [
    `Goal: ${payload.goal}`,
    `Resolved capability: ${payload.resolvedCapability}`,
    `Matched capabilities: ${payload.matchedCapabilities.join(", ") || "n/a"}`,
    `Discovery session: ${payload.sessionId ?? "n/a"}`,
    payload.relatedCapabilities.length ? `Related capabilities: ${payload.relatedCapabilities.join(", ")}` : null,
    Object.keys(payload.filters).length ? `Filters: ${formatDiscoverFilters(payload.filters)}` : null,
    `Scanned ${payload.scannedCandidates} of ${payload.totalCandidates} candidates, kept ${payload.results.length}.`,
    "",
    payload.results.length === 0 ? "No live candidates matched this goal." : "Top candidates:",
  ].filter(Boolean);

  for (const [index, entry] of payload.results.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${entry.endpointId}`,
      `   ${entry.resource}`,
      `   price ${formatMoney(entry.priceUsdc)} | score ${formatNumber(entry.score, 1)} | network ${entry.network} | asset ${entry.asset}`,
      `   trust ${classifyDiscoverTrust(entry)} | freshness ${formatFreshness(entry.dataFreshnessSeconds)} | uptime ${formatPercent(entry.trust?.uptimePct)} | success ${formatPercent(entry.trust?.successRate)}`,
      `   capabilities: ${(entry.capabilities ?? []).join(", ") || "n/a"}`,
      entry.reasons?.length ? `   why: ${entry.reasons.slice(0, 2).join(" | ")}` : "   why: no ranked reason text returned",
    );
  }

  if (payload.suggestedNext.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedActionPayload(entry));
    }
  }

  return lines.join("\n");
}

function formatEndpointInspectionPayload(payload) {
  const analytics = payload.analytics;
  const lines = [
    `Endpoint: ${analytics.endpoint?.endpointId ?? "n/a"}`,
    payload.summary,
    `Verdict: ${payload.verdict}`,
    analytics.endpoint?.resource ? `Resource: ${analytics.endpoint.resource}` : null,
    `Capabilities: ${(analytics.endpoint?.capabilities ?? []).join(", ") || "n/a"}`,
    `Trust: ${analytics.trustProfile?.status ?? "n/a"} (${formatNumber(analytics.trustProfile?.score, 1)})`,
    `Freshness: latest probe ${formatDate(analytics.trustProfile?.operations?.latestProbeAt)} | healthy ${formatDate(analytics.trustProfile?.operations?.lastHealthyAt)}`,
    `Payments: ${analytics.payments?.totalPaymentCount ?? 0} total | ${formatMoney(analytics.payments?.totalAmountUsdc)}`,
    `Routing: ${analytics.routing?.totalRouteSelections ?? 0} route selections | ${analytics.trustProfile?.operations?.totalProbeCount ?? 0} probes`,
    analytics.trustProfile?.security?.status ? `Security: ${analytics.trustProfile.security.status}` : null,
  ].filter(Boolean);

  if (analytics.recentProbes?.length) {
    const latestProbe = analytics.recentProbes[0];
    lines.push(
      "",
      `Latest probe: ${latestProbe.status ?? "n/a"} at ${formatDate(latestProbe.probedAt ?? latestProbe.capturedAt)}${latestProbe.latencyMs === undefined ? "" : ` | p50 latency ${latestProbe.latencyMs}ms`}`,
    );
  }

  if (analytics.recentPayments?.length) {
    lines.push(
      "",
      "Recent payments:",
      ...analytics.recentPayments.slice(0, 3).map((payment, index) =>
        `${index + 1}. ${formatMoney(payment.amountUsdc)} from ${payment.payer ?? payment.from ?? "unknown"} at ${formatDate(payment.observedAt ?? payment.createdAt)}`,
      ),
    );
  }

  if (analytics.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of analytics.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry));
    }
  }

  return lines.join("\n");
}

function formatAgentInspectionPayload(payload) {
  const analytics = payload.analytics;
  const lines = [
    `Agent: ${analytics.address ?? "n/a"}`,
    payload.summary,
    `Verdict: ${payload.verdict}`,
    `Lookback: ${analytics.lookbackDays ?? DEFAULT_LOOKBACK_DAYS} days`,
    `Paid route requests: ${analytics.oracleUsage?.totalPaidRouteRequests ?? 0}`,
    `Payments: ${analytics.payments?.totalPaymentCount ?? 0} total | ${formatMoney(analytics.payments?.totalAmountUsdc)}`,
    `Wallet flow 24h: in ${formatMoney(analytics.walletFlowSignals?.trailing24h?.inboundAmountUsdc)} | out ${formatMoney(analytics.walletFlowSignals?.trailing24h?.outboundAmountUsdc)} | counterparties ${analytics.walletFlowSignals?.trailing24h?.counterpartyCount ?? 0}`,
    `Prediction-market exposure 7d: ${analytics.walletFlowSignals?.predictionMarketExposure7d?.paymentCount ?? 0} payments | ${formatMoney(analytics.walletFlowSignals?.predictionMarketExposure7d?.totalAmountUsdc)}`,
  ];

  if (analytics.oracleUsage?.topEndpoints?.length) {
    lines.push(
      "",
      "Top routed endpoints:",
      ...analytics.oracleUsage.topEndpoints.slice(0, 3).map((entry, index) =>
        `${index + 1}. ${entry.endpoint.endpointId} | selections ${entry.selectionCount} | avg score ${formatNumber(entry.averageScore, 2)}`,
      ),
    );
  }

  if (analytics.payments?.topCounterparties?.length) {
    lines.push(
      "",
      "Top counterparties:",
      ...analytics.payments.topCounterparties.slice(0, 3).map((entry, index) =>
        `${index + 1}. ${entry.payTo} | ${formatMoney(entry.totalAmountUsdc)} | ${entry.paymentCount} payments`,
      ),
    );
  }

  if (analytics.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of analytics.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry));
    }
  }

  return lines.join("\n");
}

function formatComparePayload(payload) {
  const lines = [
    `Goal: ${payload.goal}`,
    payload.compare?.summary ? `Summary: ${payload.compare.summary}` : null,
    payload.discover.relatedCapabilities?.length ? `Related capabilities: ${payload.discover.relatedCapabilities.join(", ")}` : null,
    "",
    payload.shortlist.length === 0 ? "No endpoints resolved for comparison." : "Shortlist:",
  ].filter(Boolean);

  for (const [index, entry] of payload.shortlist.slice(0, 5).entries()) {
    lines.push(
      `${index + 1}. ${entry.endpointId}`,
      `   ${entry.recommendation} | security ${entry.securityStatus} | price ${formatMoney(entry.priceUsdc)}`,
      `   breakdown price ${formatNumber(entry.scoreBreakdown.price, 1)} | trust ${formatNumber(entry.scoreBreakdown.trust, 1)} | freshness ${formatNumber(entry.scoreBreakdown.freshness, 1)} | commerce ${formatNumber(entry.scoreBreakdown.observedCommerce, 1)} | composite ${formatNumber(entry.scoreBreakdown.composite, 1)}`,
      `   payments ${entry.totalPayments} | route selections ${entry.totalRouteSelections} | latest probe ${formatDate(entry.latestProbeAt)}`,
    );
  }

  if (payload.compare?.synthesis?.summary) {
    lines.push("", `Synthesis: ${payload.compare.synthesis.summary}`);
    if (payload.compare.synthesis.keyDifferences?.length) {
      lines.push(...payload.compare.synthesis.keyDifferences.map((entry) => `- ${entry}`));
    }
    if (payload.compare.synthesis.tradeoffs?.length) {
      lines.push(...payload.compare.synthesis.tradeoffs.map((entry) => `- ${entry}`));
    }
  }

  if (payload.compare?.suggestedNext?.length) {
    lines.push("", "Suggested next:");
    for (const entry of payload.compare.suggestedNext.slice(0, 4)) {
      lines.push(...formatSuggestedAction(entry, payload.goal));
    }
  }

  return lines.join("\n");
}

function formatRecipeDirectoryPayload(payload) {
  const queryLabel = payload.query ? `Recipes matching "${payload.query}"` : "Recipes";
  const lines = [
    `${queryLabel}: ${payload.totalRecipes ?? 0} total`,
    payload.nextCursor ? `Next cursor: ${payload.nextCursor}` : null,
    "",
  ].filter(Boolean);

  for (const [index, entry] of (payload.results ?? []).slice(0, 10).entries()) {
    lines.push(
      `${index + 1}. ${entry.displayName} [${entry.slug}]`,
      `   cluster ${entry.cluster ?? "n/a"} | price ${formatMoney(entry.priceUsdc)} | quality ${formatNumber(entry.qualityScore, 2)} | freshness ${formatNumber(entry.freshnessScore, 2)}`,
      `   capabilities: ${(entry.capabilities ?? []).join(", ") || "n/a"}`,
      `   ${entry.summary}`,
    );
  }

  if ((payload.results ?? []).length === 0) {
    lines.push("No recipes matched the current filters.");
  }

  return lines.join("\n");
}

function normalizeProviderDirectoryEntry(entry) {
  return {
    slug: entry.provider?.slug ?? null,
    displayName: entry.provider?.displayName ?? null,
    summary: entry.provider?.description ?? null,
    homepage: entry.provider?.homepage ?? null,
    docsUrl: entry.provider?.docsUrl ?? null,
    recommendation: entry.readiness?.recommendation ?? null,
    readinessSummary: entry.readiness?.summary ?? null,
    capabilityCount: entry.provider?.capabilities?.length ?? 0,
    endpointCount: entry.provider?.endpointCount ?? 0,
    verificationStatus: entry.provider?.verificationStatus ?? null,
    listingStatus: entry.provider?.listingStatus ?? null,
    profileUrl: entry.profileUrl ?? null,
  };
}

function formatRecipeDetailPayload(payload) {
  const recipe = payload.recipe ?? {};
  return [
    `${recipe.displayName ?? recipe.slug ?? "Recipe"} [${recipe.slug ?? "n/a"}]`,
    recipe.summary ?? "No summary returned.",
    `Price: ${formatMoney(recipe.priceUsdc)}`,
    `Capabilities: ${(recipe.capabilities ?? []).join(", ") || "n/a"}`,
    `Cluster: ${payload.marketplace?.cluster ?? "n/a"}`,
    payload.creator?.displayName ? `Creator: ${payload.creator.displayName}` : null,
    payload.stats ? `Runs: ${payload.stats.paidRunCount ?? 0} | quality ${formatNumber(payload.stats.qualityScore, 2)} | freshness ${formatNumber(payload.stats.freshnessScore, 2)}` : null,
  ].filter(Boolean).join("\n");
}

function formatProviderDetailPayload(payload) {
  const provider = payload.provider ?? {};
  return [
    `${provider.displayName ?? provider.slug ?? "Provider"} [${provider.slug ?? "n/a"}]`,
    provider.description ?? "No description returned.",
    `Homepage: ${provider.homepage ?? "n/a"}`,
    `Docs: ${provider.docsUrl ?? "n/a"}`,
    `Recommendation: ${payload.readiness?.recommendation ?? "n/a"}`,
    payload.readiness?.summary ? `Readiness: ${payload.readiness.summary}` : null,
    `Endpoints: ${(payload.endpoints ?? []).length}`,
    `Capabilities: ${(provider.capabilities ?? []).slice(0, 12).join(", ") || "n/a"}`,
  ].filter(Boolean).join("\n");
}

function formatProvidersDirectoryPayload(payload) {
  const label = payload.query ? `Providers matching "${payload.query}"` : "Providers";
  const lines = [`${label}: ${payload.totalProviders}`, ""];
  for (const [index, entry] of payload.results.entries()) {
    lines.push(
      `${index + 1}. ${entry.displayName} [${entry.slug}]`,
      `   recommendation ${entry.recommendation ?? "n/a"} | endpoints ${entry.endpointCount} | capabilities ${entry.capabilityCount}`,
      `   ${entry.summary ?? "No provider summary returned."}`,
    );
  }
  if (payload.results.length === 0) {
    lines.push("No providers matched the current filters.");
  }
  return lines.join("\n");
}

function formatRecipeRecommendPayload(payload) {
  const lines = [
    `Goal: ${payload.goal}`,
    `Resolved capability: ${payload.resolvedCapability ?? "n/a"}`,
    "",
  ];
  for (const [index, entry] of payload.recommendations.entries()) {
    lines.push(
      `${index + 1}. ${entry.displayName ?? entry.slug} [${entry.slug}]`,
      `   price ${formatMoney(entry.priceUsdc)}${entry.resource ? ` | ${entry.resource}` : ""}`,
      `   ${entry.reason}`,
    );
  }
  if (payload.recommendations.length === 0) {
    lines.push("No recipe recommendations matched this goal.");
  }
  return lines.join("\n");
}

function formatRecipeRunPayload(payload) {
  const lines = [
    `Recipe run: ${payload.slug}`,
    payload.inspectionUrl ? `Inspection URL: ${payload.inspectionUrl}` : "Inspection URL: not returned",
    payload.savedTo ? `Saved output: ${payload.savedTo}` : null,
    payload.openMessage ? `Open: ${payload.openMessage}` : null,
  ].filter(Boolean);
  if (payload.result) {
    lines.push("", typeof payload.result === "string" ? payload.result : stringifyJson(payload.result));
  }
  return lines.join("\n");
}

function formatCatalogUpdatePayload(payload) {
  return [
    "Catalog updated.",
    `Recipes: ${payload.recipes}`,
    `Providers: ${payload.providers}`,
    `Snapshot: ${payload.cachePath}`,
    `llms.txt: ${payload.llms.llmsPath}`,
    `llms-full.txt: ${payload.llms.llmsFullPath}`,
    "",
    formatCatalogDiffLines(payload.diff),
  ].join("\n");
}

function formatWatchPayload(payload) {
  const lines = [
    `Watch target: ${payload.targetType} ${payload.targetValue}`,
    `Events observed: ${payload.events.length}`,
  ];
  if (payload.webhookUrl) {
    lines.push(`Webhook: ${payload.webhookUrl}`);
  }
  for (const event of payload.events) {
    lines.push(
      "",
      `${event.type.toUpperCase()} ${event.detectedAt}`,
      event.summary,
    );
  }
  return lines.join("\n");
}

function formatExportMcpConfigPayload(payload) {
  const sections = [
    `Remote MCP URL: ${payload.remoteMcpUrl}`,
  ];
  for (const client of payload.clients) {
    sections.push("", `${client.title}:`, client.snippet);
  }
  return sections.join("\n");
}

function formatExportOpenApiPayload(payload) {
  return [
    "OpenAPI-style surface export:",
    `Base URL: ${payload.baseUrl}`,
    "",
    ...payload.paths.map((entry) => `${entry.method} ${entry.path} - ${entry.operationId}`),
  ].join("\n");
}

function formatInitAutomationPayload(payload) {
  return [
    `${payload.title}:`,
    "",
    payload.template,
  ].join("\n");
}

function formatChangelogPayload(payload) {
  if (!payload.hasBaseline) {
    return "No cached baseline found. Run `402bot catalog update` first to establish a catalog snapshot.";
  }
  return [
    `Compared at: ${payload.comparedAt}`,
    "",
    formatCatalogDiffLines(payload.diff),
  ].join("\n");
}

function formatCatalogDiffLines(diff) {
  return [
    `Recipes added: ${diff.recipes.added.length} | removed: ${diff.recipes.removed.length} | changed: ${diff.recipes.changed.length}`,
    `Providers added: ${diff.providers.added.length} | removed: ${diff.providers.removed.length} | changed: ${diff.providers.changed.length}`,
  ].join("\n");
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
      formatDiscoverPayload({
        schema: "402bot/discover/v1",
        goal: payload.goal,
        requested: {},
        filters: {},
        sessionId: payload.discover.sessionId ?? payload.discover.requestId ?? null,
        resolvedCapability: payload.discover.resolvedCapability,
        matchedCapabilities: payload.discover.matchedCapabilities ?? [],
        relatedCapabilities: payload.discover.relatedCapabilities ?? [],
        totalCandidates: payload.discover.totalCandidates ?? payload.discover.results.length,
        scannedCandidates: payload.discover.results.length,
        filteredCandidates: payload.discover.results.length,
        continuationRequests: 0,
        results: payload.discover.results,
        suggestedNext: (payload.discover.suggestedNext ?? []).map((entry) =>
          buildSuggestedActionPayload(entry, payload.goal)
        ),
      }),
    ].join("\n");
  }

  return formatComparePayload(payload);
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

function formatConfigPayload(payload) {
  if (payload.schema === "402bot/config-get/v1") {
    return [
      `Config key: ${payload.key}`,
      `Value: ${payload.value === null ? "unset" : payload.value}`,
      `Config path: ${payload.paths.configPath}`,
    ].join("\n");
  }

  return [
    "402bot config",
    "",
    `campaignId: ${payload.config.campaignId ?? "unset"}`,
    `network: ${payload.config.network ?? "unset"}`,
    `spendLimitDaily: ${payload.config.spendLimitDaily ?? "unset"}`,
    `spendLimitPerTx: ${payload.config.spendLimitPerTx ?? "unset"}`,
    `favoriteWallet: ${payload.config.favoriteWallet ?? "unset"}`,
    `favoriteRecipe: ${payload.config.favoriteRecipe ?? "unset"}`,
    "",
    `402bot config: ${payload.paths.configPath}`,
    `x402-proxy config dir: ${payload.paths.x402ProxyConfigDir}`,
  ].join("\n");
}

function formatConfigSetPayload(payload) {
  return [
    `Updated ${payload.updatedKey}`,
    `Value: ${payload.value}`,
    `Config path: ${payload.paths.configPath}`,
  ].join("\n");
}

function formatDoctorPayload(payload) {
  const lines = [
    "402bot doctor",
    "",
    `Overall: ${payload.status}`,
    payload.fix?.attempted ? `Fixes applied: ${payload.fix.applied.length ? payload.fix.applied.join(" | ") : "none"}` : null,
    payload.warnings.length ? `Warnings: ${payload.warnings.join(" | ")}` : "Warnings: none",
    "",
    `Proxy: ${payload.proxy.available ? "ok" : "missing"}${payload.proxy.command ? ` | ${payload.proxy.command}` : ""}`,
    `CoinGecko CLI: ${payload.marketCli?.available ? "ok" : "missing"}${payload.marketCli?.command ? ` | ${payload.marketCli.command}` : ""}${payload.marketCli?.version ? ` | ${payload.marketCli.version}` : ""}`,
    `API: ${payload.api.ok ? "ok" : "unreachable"} | ${payload.api.url}${payload.api.statusCode ? ` | ${payload.api.statusCode}` : ""}`,
    `MCP: ${payload.mcp.ok ? "ok" : "unreachable"} | ${payload.mcp.remoteUrl}${payload.mcp.statusCode ? ` | ${payload.mcp.statusCode}` : ""}`,
    `Wallet source: ${payload.wallet.source}`,
    payload.wallet.evmAddress ? `Base wallet: ${payload.wallet.evmAddress}` : "Base wallet: not configured",
    payload.wallet.base.balances
      ? `Base balances: ${formatMaybeNumber(payload.wallet.base.balances.usdc, 4)} USDC | ${formatMaybeNumber(payload.wallet.base.balances.eth, 6)} ETH`
      : `Base RPC: ${payload.wallet.base.ok ? "ok" : "error"}`,
    payload.wallet.solanaAddress ? `Solana wallet: ${payload.wallet.solanaAddress}` : "Solana wallet: not configured",
    payload.wallet.solana.balances
      ? `Solana balances: ${formatMaybeNumber(payload.wallet.solana.balances.usdc, 4)} USDC | ${formatMaybeNumber(payload.wallet.solana.balances.sol, 6)} SOL`
      : `Solana RPC: ${payload.wallet.solana.ok ? "ok" : "error"}`,
    `Ready to spend now: Base ${payload.wallet.readyToSpend.base ? "yes" : "no"} | Solana ${payload.wallet.readyToSpend.solana ? "yes" : "no"}`,
    "",
    `Config: ${payload.config.paths.botConfigPath}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function formatSpendPayload(payload) {
  return [
    `Spend window: ${payload.window.label}`,
    `Records: ${payload.summary.count} total | ${payload.summary.successful} successful | ${payload.summary.failed} failed`,
    `USDC in window: ${formatMoney(payload.summary.totalUsdc)}`,
    `Lifetime today: ${formatMoney(payload.lifetime.today)} | lifetime total: ${formatMoney(payload.lifetime.total)} | lifetime tx: ${payload.lifetime.count}`,
    "",
    `By kind: ${payload.summary.byKind.map((entry) => `${entry.kind} ${entry.count} (${formatMoney(entry.usdc)})`).join(" | ") || "n/a"}`,
    `By network: ${payload.summary.byNetwork.map((entry) => `${entry.network} ${entry.count} (${formatMoney(entry.usdc)})`).join(" | ") || "n/a"}`,
  ].join("\n");
}

function formatHistoryPayload(payload) {
  const lines = [
    `History window: ${payload.window.label}`,
    `Records: ${payload.summary.count} total | ${payload.summary.successful} successful | ${payload.summary.failed} failed`,
    "",
  ];

  for (const [index, record] of payload.records.entries()) {
    lines.push(
      `${index + 1}. ${record.kind} | ${record.ok ? "ok" : "failed"} | ${record.timestamp}`,
      `   ${record.network ?? "unknown"} | ${record.amount === null ? "n/a" : `${record.amount} ${record.token ?? ""}`.trim()}${record.label ? ` | ${record.label}` : ""}`,
    );
  }

  if (payload.records.length === 0) {
    lines.push("No payment history matched the current filter.");
  }

  return lines.join("\n");
}

function formatSetupPayload(payload) {
  const doctor = payload.doctor;
  const readiness = doctor.wallet.readyToSpend.base
    ? "You can spend now on Base."
    : doctor.wallet.readyToSpend.solana
      ? "You can spend now on Solana."
      : "Wallet setup completed, but you still need gas and USDC before you can spend.";

  return [
    "402bot setup complete.",
    readiness,
    "",
    formatDoctorPayload(doctor),
  ].join("\n");
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
      command: "402bot trade polymarket <market-url-or-slug> --outcome yes --side buy --size 1",
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

async function resolvePolymarketTarget(marketRef, outcome) {
  if (/^\d+$/.test(marketRef.trim())) {
    return {
      source: "token-id",
      tokenId: marketRef.trim(),
      outcome: outcome ?? null,
      title: null,
      defaultedOutcome: false,
    };
  }

  const slug = extractPolymarketSlug(marketRef);
  const query = slug ?? marketRef.trim();
  const payload = await requestJson(buildUrlWithQuery(POLYMARKET_SEARCH_URL, { q: query }));
  const markets = collectPolymarketMarkets(payload);
  const candidate = choosePolymarketCandidate(markets, marketRef, slug);

  if (!candidate) {
    throw new Error(`No Polymarket market matched "${marketRef}".`);
  }

  const resolvedOutcome = choosePolymarketOutcome(candidate, outcome);
  if (!resolvedOutcome) {
    const available = candidate.outcomes.map((entry) => entry.label).join(", ");
    throw new Error(`Resolved market "${candidate.title}" requires --outcome. Available outcomes: ${available}`);
  }

  return {
    source: slug ? "slug-or-url" : "title-search",
    tokenId: resolvedOutcome.tokenId,
    outcome: resolvedOutcome.label,
    title: candidate.title,
    slug: candidate.slug ?? null,
    defaultedOutcome: resolvedOutcome.defaulted,
  };
}

function collectPolymarketMarkets(payload) {
  const candidates = [];

  const pushMarket = (market, context = {}) => {
    const normalized = normalizePolymarketMarket(market, context);
    if (normalized) {
      candidates.push(normalized);
    }
  };

  if (Array.isArray(payload?.markets)) {
    for (const market of payload.markets) {
      pushMarket(market);
    }
  }

  if (Array.isArray(payload?.events)) {
    for (const event of payload.events) {
      if (!Array.isArray(event?.markets)) {
        continue;
      }
      for (const market of event.markets) {
        pushMarket(market, {
          eventSlug: event.slug,
          eventTitle: event.title,
        });
      }
    }
  }

  const byKey = new Map();
  for (const candidate of candidates) {
    const key = candidate.id ?? candidate.slug ?? candidate.title;
    if (!byKey.has(key)) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function normalizePolymarketMarket(input, context = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const title = getFirstString(input, ["question", "title"]) ?? context.eventTitle;
  if (!title) {
    return null;
  }

  const rawOutcomes = parseLooseJsonArray(input.outcomes);
  const rawTokenIds = parseLooseJsonArray(input.clobTokenIds ?? input.tokenIds ?? input.tokens);
  const outcomes = [];

  if (rawOutcomes.length && rawTokenIds.length && rawOutcomes.length === rawTokenIds.length) {
    for (let index = 0; index < rawOutcomes.length; index += 1) {
      outcomes.push({
        label: String(rawOutcomes[index]),
        tokenId: String(rawTokenIds[index]),
      });
    }
  } else if (Array.isArray(input.tokens)) {
    for (const token of input.tokens) {
      const tokenId = getFirstString(token, ["tokenId", "tokenID", "id", "asset_id"]);
      const label = getFirstString(token, ["outcome", "label", "name"]);
      if (tokenId && label) {
        outcomes.push({ label, tokenId });
      }
    }
  }

  return {
    id: getFirstString(input, ["id", "marketId"]),
    slug: getFirstString(input, ["slug"]) ?? context.eventSlug ?? null,
    title,
    outcomes,
  };
}

function choosePolymarketCandidate(candidates, marketRef, slug) {
  if (slug) {
    const slugLower = slug.toLowerCase();
    const exact = candidates.find((entry) => entry.slug?.toLowerCase() === slugLower);
    if (exact) {
      return exact;
    }
  }

  const normalizedRef = marketRef.trim().toLowerCase();
  const exactTitle = candidates.find((entry) => entry.title.toLowerCase() === normalizedRef);
  if (exactTitle) {
    return exactTitle;
  }

  return candidates[0] ?? null;
}

function choosePolymarketOutcome(candidate, requestedOutcome) {
  if (candidate.outcomes.length === 0) {
    return null;
  }
  if (candidate.outcomes.length === 1) {
    return {
      ...candidate.outcomes[0],
      defaulted: false,
    };
  }

  if (requestedOutcome) {
    const normalized = requestedOutcome.trim().toLowerCase();
    const match = candidate.outcomes.find((entry) => entry.label.trim().toLowerCase() === normalized);
    if (match) {
      return {
        ...match,
        defaulted: false,
      };
    }
    return null;
  }

  const yesOutcome = candidate.outcomes.find((entry) => entry.label.trim().toLowerCase() === "yes");
  if (yesOutcome) {
    return {
      ...yesOutcome,
      defaulted: true,
    };
  }

  return null;
}

function getFirstString(value, keys) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function parseLooseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractPolymarketSlug(value) {
  try {
    const url = new URL(value);
    if (!/polymarket\.com$/i.test(url.hostname) && !/polymarket\.com$/i.test(url.hostname.replace(/^www\./i, ""))) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return /^[a-z0-9-]+$/i.test(value.trim()) ? value.trim() : null;
  }
}

function computeEndpointVerdict(payload) {
  const trustScore = payload.trustProfile?.score ?? 0;
  const stale = Boolean(payload.trustProfile?.operations?.stale);
  const criticalFlags = (payload.trustProfile?.flags ?? []).filter((entry) => entry.severity === "critical");
  const securityScore = payload.trustProfile?.security?.securityScore;

  if (
    payload.trustProfile?.status === "degraded" ||
    criticalFlags.length > 0 ||
    (typeof securityScore === "number" && securityScore < 70)
  ) {
    return "avoid";
  }
  if (
    trustScore >= 70 &&
    !stale &&
    (payload.trustProfile?.security?.status === "unavailable" || (securityScore ?? 0) >= 80)
  ) {
    return "route";
  }
  return "monitor";
}

function buildEndpointVerdictSummary(payload, verdict) {
  if (verdict === "route") {
    return "Observed trust, payment history, and operational freshness are strong enough to route traffic now.";
  }
  if (verdict === "avoid") {
    return "Operational or security signals make this a poor default route right now.";
  }
  return "The endpoint is usable, but it should stay on a monitored shortlist rather than being the default route.";
}

function computeAgentVerdict(payload) {
  const routeRequests = payload.oracleUsage?.totalPaidRouteRequests ?? 0;
  const payments = payload.payments?.totalPaymentCount ?? 0;
  if (routeRequests >= 3 && payments >= 3) {
    return "route";
  }
  if (routeRequests === 0 && payments === 0) {
    return "avoid";
  }
  return "monitor";
}

function buildAgentVerdictSummary(payload, verdict) {
  if (verdict === "route") {
    return "The address shows enough paid oracle usage and onchain settlement to be treated as an observed operator.";
  }
  if (verdict === "avoid") {
    return "There is not enough observed behavior yet to treat this address as a trusted operator profile.";
  }
  return "The address has some observed behavior, but it still needs more history before it becomes a strong reference profile.";
}

function classifyDiscoverTrust(entry) {
  if (entry.trust?.erc8004Verified) {
    return "verified";
  }
  if (entry.trust?.latestProbeAt) {
    return "observed";
  }
  return "experimental";
}

function normalizeEndpointRecommendation(value) {
  if (value === "route_now") {
    return "route";
  }
  if (value === "avoid") {
    return "avoid";
  }
  return "monitor";
}

function computeFreshnessScore(latestProbeAt) {
  if (!latestProbeAt) {
    return 0;
  }
  const ageMs = Date.now() - new Date(latestProbeAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0;
  }
  if (ageMs <= 60 * 60 * 1000) {
    return 100;
  }
  if (ageMs <= 6 * 60 * 60 * 1000) {
    return 85;
  }
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return 70;
  }
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
    return 45;
  }
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) {
    return 20;
  }
  return 0;
}

function buildTimeWindowPayload(timeWindow) {
  return {
    label: timeWindow?.label ?? "all time",
    since: timeWindow ? new Date(timeWindow.sinceMs).toISOString() : null,
  };
}

function normalizeHistoryRecord(record) {
  return {
    timestamp: new Date(record.t).toISOString(),
    kind: record.kind,
    ok: Boolean(record.ok),
    amount: typeof record.amount === "number" ? record.amount : null,
    token: record.token ?? null,
    network: record.net ?? null,
    label: record.label ?? null,
    tx: record.tx ?? null,
    model: record.model ?? null,
    meta: record.meta ?? null,
  };
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

function parseCommaSeparatedListValue(value) {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    return {
      ok: false,
      message: "must contain at least one comma-separated value.",
    };
  }
  return {
    ok: true,
    value: entries,
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

function parseParaswapSideValue(value) {
  const normalized = String(value).trim().toUpperCase();
  if (!["SELL", "BUY"].includes(normalized)) {
    return {
      ok: false,
      message: "must be BUY or SELL.",
    };
  }
  return {
    ok: true,
    value: normalized,
  };
}

function parseJupiterSwapModeValue(value) {
  const normalized = String(value).trim();
  if (!["ExactIn", "ExactOut"].includes(normalized)) {
    return {
      ok: false,
      message: "must be ExactIn or ExactOut.",
    };
  }
  return {
    ok: true,
    value: normalized,
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
  if (!["wallet", "treasury", "defi-risk", "prediction-markets", "counterparty-map", "polymarket"].includes(value)) {
    return {
      ok: false,
      message: "must be one of wallet, treasury, defi-risk, prediction-markets, counterparty-map, or polymarket.",
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

function parseDocsProfileValue(value) {
  if (!["brief", "audit", "integration-notes"].includes(value)) {
    return {
      ok: false,
      message: "must be one of brief, audit, or integration-notes.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseDocsScopeValue(value) {
  if (!["page", "domain", "subdomains"].includes(value)) {
    return {
      ok: false,
      message: "must be one of page, domain, or subdomains.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseDiscoverTrustValue(value) {
  if (!["experimental", "observed", "verified"].includes(value)) {
    return {
      ok: false,
      message: "must be one of experimental, observed, or verified.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseTimeWindowValue(value) {
  if (!parseTimeWindowSpecLike(value)) {
    return {
      ok: false,
      message: "must be a relative duration like 30s, 30m, 6h, 7d, or an ISO timestamp.",
    };
  }
  return {
    ok: true,
    value,
  };
}

function parseBooleanValue(value) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseTimeWindowSpecLike(value, now = new Date()) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const durationMatch = trimmed.match(/^(\d+)([smhdw])$/i);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    const multiplier =
      unit === "s" ? 1000
      : unit === "m" ? 60 * 1000
      : unit === "h" ? 60 * 60 * 1000
      : unit === "d" ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
    return {
      label: trimmed,
      sinceMs: now.getTime() - amount * multiplier,
      ms: amount * multiplier,
    };
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      label: trimmed,
      sinceMs: parsed.getTime(),
      ms: Math.max(0, now.getTime() - parsed.getTime()),
    };
  }

  return null;
}

function normalizeConfigKey(value) {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "campaign-id":
    case "campaignid":
      return "campaignId";
    case "network":
      return "network";
    case "spend-cap":
    case "spend-limit-daily":
    case "spendlimitdaily":
      return "spendLimitDaily";
    case "spend-cap-per-tx":
    case "spend-limit-per-tx":
    case "spendlimitpertx":
      return "spendLimitPerTx";
    case "favorite-wallet":
    case "favoritewallet":
      return "favoriteWallet";
    case "favorite-recipe":
    case "favoriterecipe":
      return "favoriteRecipe";
    default:
      return null;
  }
}

function parseConfigValue(key, value) {
  if (["campaignId", "network", "favoriteWallet", "favoriteRecipe"].includes(key)) {
    if (!value.trim()) {
      return { ok: false, message: `${key} requires a non-empty value.` };
    }
    return { ok: true, value: value.trim() };
  }

  if (["spendLimitDaily", "spendLimitPerTx"].includes(key)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, message: `${key} must be a positive number.` };
    }
    return { ok: true, value: parsed };
  }

  return { ok: false, message: `Unsupported config key: ${key}` };
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

function formatDiscoverFilters(filters) {
  return Object.entries(filters).map(([key, value]) => `${key}=${value}`).join(", ");
}

function formatMaybeNumber(value, digits) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function stringifyJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function clampScore(value) {
  return Math.min(100, Math.max(0, value));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const invocation = await applyRuntimeDefaults(buildProxyInvocation(argv, env), env);

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
      const result = await executeHttpInvocation(invocation);
      if (result.output) {
        process.stdout.write(`${result.output}\n`);
      }
      return result.exitCode;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${detail}\n`);
      return 1;
    }
  }

  if (invocation.type === "local") {
    try {
      const result = await executeLocalInvocation(invocation, env);
      if (result.output) {
        process.stdout.write(`${result.output}\n`);
      }
      return result.exitCode;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${detail}\n`);
      return 1;
    }
  }

  const result = await runProxyArgs(invocation.proxyArgs, env, {
    useOverlay: invocation.proxyArgs[0] !== "setup",
    captureStdout: false,
  });
  return result.exitCode;
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

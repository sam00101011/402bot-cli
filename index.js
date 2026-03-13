#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const DEFAULT_API_BASE_URL = "https://api.402.bot";
export const DEFAULT_MCP_URL = "https://api.402.bot/mcp";

const HTTP_SURFACES = {
  route: { method: "POST", path: "/v1/route" },
  "route-probe": { method: "POST", path: "/v1/route/probe" },
  transform: { method: "POST", path: "/v1/alchemist/transform" },
  "fetch-transform": { method: "POST", path: "/v1/alchemist/fetch-transform" },
  "fetch-sources": { method: "GET", path: "/v1/alchemist/fetch-sources" },
  materialize: { method: "POST", path: "/v1/alchemist/materialize" },
  recipes: { method: "GET", path: "/v1/recipes" },
};

function apiBaseUrl(env = process.env) {
  return env.BOT402_API_URL || DEFAULT_API_BASE_URL;
}

function mcpBaseUrl(env = process.env) {
  return env.BOT402_MCP_URL || DEFAULT_MCP_URL;
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

  const url = new URL(remoteUrl);
  if (campaignId) {
    url.searchParams.set("campaignId", campaignId);
  }

  return {
    type: "proxy",
    proxyArgs: ["mcp", ...passthrough, url.toString()],
  };
}

function buildRecipeInvocation(args, env = process.env) {
  const [action, slug, ...rest] = args;
  if (action !== "run") {
    return {
      type: "error",
      message: "Usage: 402bot recipe run <slug> [x402-proxy fetch flags]",
    };
  }
  if (!slug || slug.startsWith("-")) {
    return { type: "error", message: "recipe run requires a <slug>." };
  }
  return buildFetchInvocation(
    `${apiBaseUrl(env)}/v1/recipes/${encodeURIComponent(slug)}/run`,
    "POST",
    rest,
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
        message: "Usage: 402bot polymarket <order|performance> ...",
      };
  }
}

export function buildUsage() {
  return [
    "Usage: 402bot <command> [options]",
    "",
    "Wallet and status:",
    "  402bot setup",
    "  402bot status",
    "  402bot wallet [subcommand]",
    "",
    "Agent and DeFi examples:",
    "  402bot mcp --campaign-id defi-agent-alpha",
    "",
    "  402bot route --body '{\"goal\":\"find the best live Base wallet-intelligence or risk API for an autonomous trading agent\"}'",
    "  402bot route-probe",
    "  402bot transform --body '{...}'",
    "  402bot fetch-transform --body '{\"sourceId\":\"cloudflare_crawl\",\"params\":{\"url\":\"https://docs.uniswap.org\"}}'",
    "  402bot fetch-sources",
    "  402bot materialize --body '{\"templateId\":\"wallet_portfolio\",\"parameters\":{\"wallet\":\"0x...\"}}'",
    "  402bot recipes",
    "  402bot recipe run wallet-intel-brief --body '{\"wallet\":\"0x...\"}'",
    "  402bot polymarket order --body '{\"market\":\"...\",\"side\":\"buy\"}'",
    "  402bot polymarket performance <address>",
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
  if (argv.length === 0 || isHelpFlag(argv[0])) {
    return { type: "help", text: buildUsage() };
  }

  const [command, ...rest] = argv;

  if (command === "setup" || command === "status") {
    return { type: "proxy", proxyArgs: [command, ...rest] };
  }

  if (command === "wallet") {
    return { type: "proxy", proxyArgs: ["wallet", ...rest] };
  }

  if (command === "mcp") {
    return buildMcpInvocation(rest, env);
  }

  if (command === "recipe") {
    return buildRecipeInvocation(rest, env);
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

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${detail}\n`);
      process.exit(1);
    });
}

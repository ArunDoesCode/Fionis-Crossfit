/**
 * Walks the route registry (populated as an import side effect of
 * `mainRouter`) and emits two committed contract files under `.contracts/`:
 *  - `api-manifest.json`: compact, agent-queryable descriptors (`contract:query`)
 *  - `openapi.json`: OpenAPI 3.1, the input of the clients' generated types
 *
 * Usage: `bun run contract:generate`.
 * `--check` (`bun run contract:check`, run in CI) writes nothing and exits 1
 * if either committed file differs from what the code would generate. The
 * output is deterministic (no timestamp).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import { z } from "zod";

import { getRegistry, type RouteDescriptor } from "../src/lib/route-registry";
import "../src/routes/index";

// ─── JSON Schema → compact type flattener ──────────────────────────────────

type JsonSchemaNode = Record<string, unknown>;
type Compact = string | Record<string, unknown>;

function suffix(required: boolean): string {
  return required ? ".required" : ".optional";
}

function isNullableAnyOf(node: JsonSchemaNode): JsonSchemaNode | undefined {
  const anyOf = node.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) {
    return undefined;
  }
  const nullBranch = anyOf.find(
    (branch): branch is JsonSchemaNode =>
      typeof branch === "object" &&
      branch !== null &&
      (branch as JsonSchemaNode).type === "null",
  );
  const otherBranch = anyOf.find(
    (branch): branch is JsonSchemaNode =>
      typeof branch === "object" &&
      branch !== null &&
      (branch as JsonSchemaNode).type !== "null",
  );
  if (nullBranch && otherBranch) {
    return otherBranch;
  }
  return undefined;
}

function compactType(node: unknown, required: boolean): Compact {
  if (node === undefined || node === null || typeof node !== "object") {
    return `unknown${suffix(required)}`;
  }

  const schema = node as JsonSchemaNode;

  // Nullable field: zod v4 emits `anyOf: [{...actual}, {type:"null"}]`.
  const nullableBranch = isNullableAnyOf(schema);
  if (nullableBranch) {
    const inner = compactType(nullableBranch, true);
    if (typeof inner === "string") {
      return inner.replace(/\.required$/, `.nullable${suffix(required)}`);
    }
    return inner;
  }

  if (Array.isArray(schema.enum)) {
    return `enum:${schema.enum.join(",")}${suffix(required)}`;
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const branches = (schema.anyOf ?? schema.oneOf) as unknown[];
    const compactBranches = branches.map((branch) => compactType(branch, true));
    return `union<${compactBranches.join("|")}>${suffix(required)}`;
  }

  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const requiredFields = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = compactType(propSchema, requiredFields.has(key));
    }
    return result;
  }

  if (schema.type === "array") {
    const itemsCompact = compactType(schema.items, true);
    const itemsLabel =
      typeof itemsCompact === "string"
        ? itemsCompact.replace(/\.(required|optional)$/, "")
        : "object";
    return `array<${itemsLabel}>${suffix(required)}`;
  }

  if (schema.type === "string") {
    const modifiers: string[] = [];
    if (typeof schema.format === "string") {
      modifiers.push(schema.format);
    }
    if (typeof schema.minLength === "number" && schema.minLength > 0) {
      modifiers.push("nonempty");
    }
    return `string${modifiers.length > 0 ? `.${modifiers.join(".")}` : ""}${suffix(required)}`;
  }

  if (schema.type === "integer" || schema.type === "number") {
    const modifiers: string[] = [];
    const min = schema.minimum ?? schema.exclusiveMinimum;
    if (typeof min === "number" && min >= 0) {
      modifiers.push(
        typeof schema.exclusiveMinimum === "number"
          ? "positive"
          : "nonnegative",
      );
    }
    return `${schema.type}${modifiers.length > 0 ? `.${modifiers.join(".")}` : ""}${suffix(required)}`;
  }

  if (schema.type === "boolean") {
    return `boolean${suffix(required)}`;
  }

  if (schema.type === "null") {
    return `null${suffix(required)}`;
  }

  // No `type` key at all — zod v4 emits an empty `{}` for unrepresentable
  // types (e.g. z.date()/coerce.date() with unrepresentable:"any").
  if (Object.keys(schema).length === 0) {
    return `unrepresentable${suffix(required)}`;
  }

  return `unknown${suffix(required)}`;
}

function toCompactSchema(schema: ZodType | undefined): Compact | undefined {
  if (!schema) {
    return undefined;
  }
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
  return compactType(jsonSchema, true);
}

// ─── OpenAPI 3.1 ────────────────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

function toJsonSchema(schema: ZodType, io: "input" | "output"): JsonObject {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    unrepresentable: "any",
    io,
  }) as JsonObject;
  return rest;
}

function openApiParameters(
  schema: ZodType | undefined,
  location: "query" | "path",
): JsonObject[] {
  if (!schema) return [];
  const json = toJsonSchema(schema, "input");
  const properties = (json.properties ?? {}) as Record<string, JsonObject>;
  const required = new Set(
    Array.isArray(json.required) ? (json.required as string[]) : [],
  );
  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    in: location,
    required: location === "path" ? true : required.has(name),
    schema: propSchema,
  }));
}

function buildOpenApi(registry: readonly RouteDescriptor[]): JsonObject {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const d of registry) {
    const openApiPath = d.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const parameters = [
      ...openApiParameters(d.request?.params, "path"),
      ...openApiParameters(d.request?.query, "query"),
    ];
    const operation: JsonObject = {
      operationId: `${d.method.toLowerCase()}${d.path
        .split(/[/:]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("")}`,
      tags: d.tags,
      summary: d.summary,
      ...(d.notes ? { description: d.notes.join("\n") } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(d.request?.body
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: toJsonSchema(d.request.body, "input"),
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(d.responses).map(([status, schema]) => [
          status,
          {
            description: status.startsWith("2") ? "Success" : "Error",
            content: {
              "application/json": { schema: toJsonSchema(schema, "output") },
            },
          },
        ]),
      ),
      ...(d.auth.type === "public" ? {} : { security: [{ bearerAuth: [] }] }),
      "x-auth": d.auth,
    };
    paths[openApiPath] = {
      ...paths[openApiPath],
      [d.method.toLowerCase()]: operation,
    };
  }

  return {
    openapi: "3.1.0",
    info: { title: "Gym app API", version: "1.0.0" },
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  };
}

// ─── Manifest assembly ──────────────────────────────────────────────────────

async function main() {
  const registry = getRegistry();

  const routes = registry.map((descriptor) => ({
    id: `${descriptor.method} ${descriptor.path}`,
    method: descriptor.method,
    path: descriptor.path,
    tags: descriptor.tags,
    summary: descriptor.summary,
    auth: descriptor.auth,
    request: {
      query: toCompactSchema(descriptor.request?.query),
      body: toCompactSchema(descriptor.request?.body),
      params: toCompactSchema(descriptor.request?.params),
    },
    responses: Object.fromEntries(
      Object.entries(descriptor.responses).map(([status, schema]) => [
        status,
        toCompactSchema(schema),
      ]),
    ),
    pagination: descriptor.pagination,
    notes: descriptor.notes,
  }));

  const manifest = {
    version: "1.0.0",
    baseUrl: "/api",
    errorEnvelope: {
      success: false,
      message: "string",
      code: "string.optional",
      details: "object.optional",
    },
    routes,
  };

  const outDir = path.resolve(import.meta.dir, "..", ".contracts");
  const files = [
    {
      name: "api-manifest.json",
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      name: "openapi.json",
      content: `${JSON.stringify(buildOpenApi(registry), null, 2)}\n`,
    },
  ];

  if (process.argv.includes("--check")) {
    const stale: string[] = [];
    for (const file of files) {
      const committed = await readFile(
        path.join(outDir, file.name),
        "utf8",
      ).catch(() => "");
      if (committed !== file.content) stale.push(file.name);
    }
    if (stale.length > 0) {
      console.error(
        `backend/.contracts/${stale.join(", ")} out of date — run \`bun run contract:generate\` and commit.`,
      );
      process.exit(1);
    }
    console.log(`Contract up to date (${routes.length} routes).`);
    return;
  }

  await mkdir(outDir, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(outDir, file.name), file.content);
  }
  console.log(
    `Wrote ${routes.length} route descriptors to .contracts/{api-manifest,openapi}.json`,
  );
}

main().catch((error) => {
  console.error("Failed to generate API contract:", error);
  process.exit(1);
});

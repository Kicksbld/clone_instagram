import spec from '@clone/contract/openapi.json' with { type: 'json' };
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { FastifyInstance, FastifySchema } from 'fastify';

/**
 * Validation des entrées par les schémas du contrat (ADR-003, ADR-005) : `openapi.yaml` est bundlé
 * et déréférencé par `pnpm contract:generate`, puis compilé par Ajv (JSON Schema 2020-12).
 * Les champs inconnus sont rejetés : aucun `removeAdditional`, et `additionalProperties: false`
 * sur les paramètres construits ici.
 */

type JsonSchema = Record<string, unknown>;

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema: JsonSchema;
}

interface MediaTypeObject {
  schema?: JsonSchema;
}

interface Operation {
  operationId?: string;
  parameters?: Parameter[];
  requestBody?: { content: Record<string, MediaTypeObject> };
  responses: Record<string, { content?: Record<string, MediaTypeObject> }>;
}

type PathItem = Partial<Record<string, Operation>> & { parameters?: Parameter[] };

interface OpenApiDocument {
  paths: Record<string, PathItem>;
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

// Fichier généré à partir de notre propre contrat, validé par Redocly : la forme est garantie.
const document = spec as unknown as OpenApiDocument;

function findOperation(operationId: string): { operation: Operation; pathParameters: Parameter[] } {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation?.operationId === operationId) {
        return { operation, pathParameters: pathItem.parameters ?? [] };
      }
    }
  }
  throw new Error(`Opération absente du contrat : ${operationId}`);
}

function parametersSchema(parameters: Parameter[]): JsonSchema | undefined {
  if (parameters.length === 0) return undefined;
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(parameters.map((p) => [p.name, p.schema])),
    required: parameters.filter((p) => p.required === true).map((p) => p.name),
  };
}

/** Schémas Fastify (entrées et réponses JSON) d'une opération du contrat. */
export function routeSchemaFor(operationId: string): FastifySchema {
  const { operation, pathParameters } = findOperation(operationId);
  const parameters = [...pathParameters, ...(operation.parameters ?? [])];

  const schema: FastifySchema = {};
  const params = parametersSchema(parameters.filter((p) => p.in === 'path'));
  const querystring = parametersSchema(parameters.filter((p) => p.in === 'query'));
  const body = operation.requestBody?.content['application/json']?.schema;
  if (params) schema.params = params;
  if (querystring) schema.querystring = querystring;
  if (body) schema.body = body;

  // Les réponses d'erreur (application/problem+json) sont produites par le gestionnaire d'erreurs.
  const response = Object.fromEntries(
    Object.entries(operation.responses).flatMap(([status, value]) => {
      const json = value.content?.['application/json']?.schema;
      return json ? [[status, json]] : [];
    }),
  );
  if (Object.keys(response).length > 0) schema.response = response;

  return schema;
}

/** Remplace le compilateur de validation de Fastify par Ajv 2020, sans suppression des champs inconnus. */
export function installContractValidation(app: FastifyInstance): void {
  const common = {
    allErrors: true,
    strict: true,
    removeAdditional: false,
    useDefaults: true,
  } as const;
  // Chemin et query string arrivent en texte : seule leur conversion de type est autorisée.
  const forBody = addFormats.default(new Ajv2020({ ...common, coerceTypes: false }));
  const forUrl = addFormats.default(new Ajv2020({ ...common, coerceTypes: 'array' }));

  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'body' ? forBody : forUrl).compile(schema),
  );
}

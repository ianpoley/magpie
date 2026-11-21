export type JsonSchema =
  | { type: 'string' }
  | { type: 'boolean' }
  | { type: 'array'; items: JsonSchema }
  | {
      type: 'object';
      properties: Record<string, JsonSchema>;
      required: string[];
      additionalProperties: false;
    };

export function schemaErrors(schema: JsonSchema, value: unknown, path = '$'): string[] {
  switch (schema.type) {
    case 'string':
    case 'boolean':
      return typeof value === schema.type ? [] : [`${path} is not a ${schema.type}`];
    case 'array':
      if (!Array.isArray(value)) return [`${path} is not an array`];
      return value.flatMap((item, index) => schemaErrors(schema.items, item, `${path}[${index}]`));
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} is not an object`];
      const record = value as Record<string, unknown>;
      const errors: string[] = [];
      for (const key of schema.required) {
        if (!Object.hasOwn(record, key)) errors.push(`${path}.${key} is missing`);
      }
      for (const [key, item] of Object.entries(record)) {
        if (!Object.hasOwn(schema.properties, key)) errors.push(`${path}.${key} is not allowed`);
        else errors.push(...schemaErrors(schema.properties[key], item, `${path}.${key}`));
      }
      return errors;
    }
  }
}

export type CandidateTopics = {
  topics: { name: string; area: string; definition: string }[];
};

export const candidateTopicsSchema: JsonSchema = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, area: { type: 'string' }, definition: { type: 'string' } },
        required: ['name', 'area', 'definition'],
        additionalProperties: false,
      },
    },
  },
  required: ['topics'],
  additionalProperties: false,
};

export type CategoryList = {
  areas: { name: string; in_focus?: boolean; topics: { name: string; definition: string }[] }[];
};

export function categoryListSchema(judgeFocus: boolean): JsonSchema {
  return {
    type: 'object',
    properties: {
      areas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ...(judgeFocus ? { in_focus: { type: 'boolean' } } : {}),
            topics: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, definition: { type: 'string' } },
                required: ['name', 'definition'],
                additionalProperties: false,
              },
            },
          },
          required: judgeFocus ? ['name', 'in_focus', 'topics'] : ['name', 'topics'],
          additionalProperties: false,
        },
      },
    },
    required: ['areas'],
    additionalProperties: false,
  };
}

export type AreaJudgment = {
  areas: { name: string; in_focus: boolean }[];
};

export const areaJudgmentSchema: JsonSchema = {
  type: 'object',
  properties: {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, in_focus: { type: 'boolean' } },
        required: ['name', 'in_focus'],
        additionalProperties: false,
      },
    },
  },
  required: ['areas'],
  additionalProperties: false,
};

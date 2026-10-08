/**
 * Schema definitions and validation for Deep Research task responses
 *
 * This module provides:
 * - Strict JSON schemas for all task types
 * - Validation and normalization functions
 * - Type-safe transformations
 * - Clear error messages for format violations
 */

/**
 * Schema for plan task response
 */
export const PLAN_SCHEMA = {
  type: 'object',
  required: ['taskId', 'dimensions'],
  properties: {
    taskId: {
      type: 'string',
      description: 'Task identifier, must match input'
    },
    dimensions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 5,
            description: 'Research question or topic (plain string)'
          },
          rationale: {
            type: 'string',
            description: 'Why this dimension is important'
          },
          id: {
            type: 'string',
            description: 'Optional dimension identifier'
          }
        },
        additionalProperties: false
      }
    },
    strategy: {
      type: 'string',
      description: 'Overall research strategy'
    },
    estimatedTime: {
      type: 'number',
      minimum: 0,
      description: 'Estimated completion time in minutes'
    }
  }
};

/**
 * Schema for research/search task response
 */
export const SEARCH_SCHEMA = {
  type: 'object',
  required: ['taskId', 'sources'],
  properties: {
    taskId: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          type: { type: 'string', enum: ['web', 'paper', 'book', 'report', 'other'] },
          title: { type: 'string' },
          url: { type: 'string' },
          snippet: { type: 'string' },
          author: { type: 'string' },
          publishedDate: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Schema for verification task response
 */
export const VERIFY_SCHEMA = {
  type: 'object',
  required: ['taskId', 'credibilityScore'],
  properties: {
    taskId: { type: 'string' },
    credibilityScore: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    contradictions: { type: 'array' },
    notes: { type: 'string' }
  }
};

/**
 * Schema for synthesis task response
 */
export const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['taskId', 'entities'],
  properties: {
    taskId: { type: 'string' },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        }
      }
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from', 'to', 'type'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string' }
        }
      }
    },
    insights: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

/**
 * Schema for report writing task response
 */
export const REPORT_SCHEMA = {
  type: 'object',
  required: ['taskId', 'report'],
  properties: {
    taskId: { type: 'string' },
    report: {
      type: 'object',
      required: ['title', 'sections'],
      properties: {
        title: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['heading', 'content'],
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
              citations: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        },
        citations: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Schema for review task response
 */
export const REVIEW_SCHEMA = {
  type: 'object',
  required: ['taskId', 'verdict'],
  properties: {
    taskId: { type: 'string' },
    verdict: {
      type: 'string',
      enum: ['pass', 'revise']
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'description'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'note'] },
          description: { type: 'string' },
          suggestion: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Get schema for a task kind
 */
export function getSchema(kind) {
  const schemas = {
    plan: PLAN_SCHEMA,
    search: SEARCH_SCHEMA,
    verify: VERIFY_SCHEMA,
    synthesize: SYNTHESIS_SCHEMA,
    write: REPORT_SCHEMA,
    review: REVIEW_SCHEMA
  };
  return schemas[kind];
}

/**
 * Normalize plan response - handle various formats agents might return
 *
 * This is the compatibility layer that allows us to accept multiple formats
 * while maintaining strict output format.
 */
export function normalizePlanResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    throw new Error('响应必须是 JSON 对象');
  }

  // Extract dimensions from various possible field names and nesting levels
  let dimensionsArray = rawResponse.dimensions
    || rawResponse.researchDimensions
    || rawResponse.investigationDimensions;

  // Check nested structures
  if (!dimensionsArray && rawResponse.researchPlan) {
    dimensionsArray = rawResponse.researchPlan.dimensions;
  }
  if (!dimensionsArray && rawResponse.plan) {
    dimensionsArray = rawResponse.plan.dimensions;
  }

  if (!dimensionsArray || !Array.isArray(dimensionsArray)) {
    throw new Error(
      `响应缺少 'dimensions' 字段。` +
      `\n收到的字段: ${Object.keys(rawResponse).join(', ')}` +
      `\n请确保返回包含 'dimensions' 数组的 JSON 对象。` +
      `\n如果 dimensions 嵌套在其他对象中，请将其提升到顶层。`
    );
  }

  if (dimensionsArray.length === 0) {
    throw new Error('dimensions 数组不能为空，至少需要一个研究维度');
  }

  // Normalize each dimension
  const normalizedDimensions = dimensionsArray.map((dim, index) => {
    let query;
    let rationale = '';
    let id;

    // Handle various dimension formats
    if (typeof dim === 'string') {
      // Simple string format
      query = dim;
      id = `dim-${index}`;
    } else if (typeof dim === 'object') {
      // Extract ID
      id = dim.id || dim.dimensionId || `dim-${index}`;

      // Extract query from various sources
      if (dim.query && typeof dim.query === 'string') {
        query = dim.query;
      } else if (dim.keyQuestions && Array.isArray(dim.keyQuestions) && dim.keyQuestions.length > 0) {
        // Use first question from keyQuestions array
        query = String(dim.keyQuestions[0]);
      } else if (dim.questions && Array.isArray(dim.questions) && dim.questions.length > 0) {
        // Use first question from questions array
        query = String(dim.questions[0]);
      } else if (dim.name && typeof dim.name === 'string') {
        // Use name as query
        query = dim.name;
      } else if (dim.topic && typeof dim.topic === 'string') {
        query = dim.topic;
      } else {
        throw new Error(
          `维度 ${index} 缺少有效的查询字符串。` +
          `\n收到的字段: ${Object.keys(dim).join(', ')}` +
          `\n请提供 'query' 字段（字符串），或 'keyQuestions' 数组，或 'questions' 数组，或 'name' 字段。`
        );
      }

      // Extract rationale from various sources
      rationale = dim.rationale
        || dim.reason
        || dim.importance
        || dim.description
        || '';

      // If rationale is still empty, try to build from other fields
      if (!rationale) {
        if (dim.approach) {
          rationale = dim.approach;
        } else if (dim.priority) {
          rationale = `优先级: ${dim.priority}`;
        }
      }
    } else {
      throw new Error(
        `维度 ${index} 格式无效，必须是字符串或对象，收到: ${typeof dim}`
      );
    }

    // Validate query
    if (!query || typeof query !== 'string') {
      throw new Error(
        `维度 ${index} 的 query 必须是非空字符串，收到: ${typeof query}`
      );
    }

    if (query.trim().length < 3) {
      throw new Error(
        `维度 ${index} 的 query 太短（少于3个字符）: "${query}"`
      );
    }

    return {
      id,
      query: query.trim(),
      rationale: rationale ? String(rationale).trim() : '',
      status: 'pending'
    };
  });

  // Extract strategy
  const strategy = rawResponse.strategy
    || rawResponse.objective
    || rawResponse.approach
    || rawResponse.methodology
    || (rawResponse.researchPlan && rawResponse.researchPlan.objective)
    || (rawResponse.plan && rawResponse.plan.objective)
    || '';

  // Extract estimated time
  const estimatedTime = rawResponse.estimatedTime
    || rawResponse.estimatedDuration
    || rawResponse.expectedTime
    || (rawResponse.researchPlan && rawResponse.researchPlan.estimatedTime)
    || 0;

  return {
    dimensions: normalizedDimensions,
    strategy: strategy ? String(strategy) : '',
    estimatedTime: typeof estimatedTime === 'number' ? estimatedTime : 0
  };
}

/**
 * Validate and normalize response for any task type
 */
export function validateAndNormalize(kind, rawResponse) {
  switch (kind) {
    case 'plan':
      return normalizePlanResponse(rawResponse);

    case 'search':
      // Add normalization for other task types as needed
      return rawResponse;

    case 'verify':
      return rawResponse;

    case 'synthesize':
      return rawResponse;

    case 'write':
      return rawResponse;

    case 'review':
      return rawResponse;

    default:
      throw new Error(`未知的任务类型: ${kind}`);
  }
}

/**
 * Build detailed error message for format violations
 */
export function buildFormatErrorMessage(kind, rawResponse, error) {
  const receivedFields = rawResponse && typeof rawResponse === 'object'
    ? Object.keys(rawResponse).join(', ')
    : typeof rawResponse;

  let message = `任务 ${kind} 的响应格式不正确\n\n`;
  message += `错误: ${error.message}\n\n`;
  message += `收到的字段: ${receivedFields}\n\n`;

  if (kind === 'plan') {
    message += `期望的格式:\n`;
    message += `{\n`;
    message += `  "taskId": "...",\n`;
    message += `  "dimensions": [\n`;
    message += `    {\n`;
    message += `      "query": "研究问题（字符串）",\n`;
    message += `      "rationale": "重要性说明"\n`;
    message += `    }\n`;
    message += `  ],\n`;
    message += `  "strategy": "研究策略",\n`;
    message += `  "estimatedTime": 15\n`;
    message += `}\n\n`;
    message += `常见错误:\n`;
    message += `1. 字段名错误: 使用了 'researchDimensions' 而非 'dimensions'\n`;
    message += `2. query 类型错误: query 必须是字符串，不能是对象或数组\n`;
    message += `3. 结构过于复杂: 不要包含 questions、platforms、verifiedSeeds 等额外字段\n`;
  }

  return message;
}

/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'ct-lead-finder',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: input?.stage === 'production',
      home: 'aws',
    };
  },

  async run() {
    // ── DynamoDB table ────────────────────────────────────────────────────────
    const table = new sst.aws.Dynamo('OutreachRecords', {
      fields: {
        pk:     'string',  // userId (or "default" for shared)
        sk:     'string',  // recordId (ulid)
        status: 'string',  // for GSI filtering
      },
      primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
      globalIndexes: {
        'status-index': { hashKey: 'status', rangeKey: 'sk' },
      },
    });

    // ── API Gateway ───────────────────────────────────────────────────────────
    const api = new sst.aws.ApiGatewayV2('Api', {
      cors: {
        allowOrigins: ['http://localhost:5173', 'https://*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
      },
    });

    // Records CRUD
    api.route('GET /records',        { handler: 'api/records/list.handler',   link: [table] });
    api.route('POST /records',       { handler: 'api/records/create.handler', link: [table] });
    api.route('PUT /records/{id}',   { handler: 'api/records/update.handler', link: [table] });
    api.route('DELETE /records/{id}',{ handler: 'api/records/delete.handler', link: [table] });

    // Gmail webhook
    api.route('POST /webhook/gmail', { handler: 'api/webhook/gmail.handler',  link: [table] });

    // ── Outputs ───────────────────────────────────────────────────────────────
    return {
      apiUrl:    api.url,
      tableName: table.name,
    };
  },
});

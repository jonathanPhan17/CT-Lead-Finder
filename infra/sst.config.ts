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

    // Open tracking pixel
    api.route('GET /track/{id}/open', { handler: 'api/track/open.handler', link: [table] });

    // Gmail OAuth — exchange authorization code, store refresh token, start watch
    const gmailEnv = {
      GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID     ?? '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
      GMAIL_PUBSUB_TOPIC:   process.env.GMAIL_PUBSUB_TOPIC   ?? '',
    };

    api.route('POST /auth/gmail',    { handler: 'api/auth/gmail.handler',    link: [table], environment: gmailEnv });

    // Gmail webhook (Pub/Sub push)
    api.route('POST /webhook/gmail', { handler: 'api/webhook/gmail.handler', link: [table], environment: gmailEnv });

    // ── Reply checker cron (every 10 minutes) ─────────────────────────────────
    new sst.aws.Cron('CheckRepliesCron', {
      schedule: 'rate(2 minutes)',
      job: {
        handler:     'api/cron/checkReplies.handler',
        link:        [table],
        environment: gmailEnv,
      },
    });

    // ── Frontend (S3 + CloudFront) ────────────────────────────────────────────
    const site = new sst.aws.StaticSite('Frontend', {
      path: '../',
      build: {
        command: 'npm run build',
        output:  'dist',
      },
      indexPage: 'index.html',
      errorPage: 'index.html',  // SPA fallback — lets React Router handle routing
      environment: {
        VITE_API_URL:          api.url,
        VITE_MAX_PAGES:        process.env.VITE_MAX_PAGES        ?? '20',
        VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID ?? '',
      },
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    return {
      apiUrl:    api.url,
      tableName: table.name,
      siteUrl:   site.url,
    };
  },
});

# CT Lead Finder — Infrastructure

AWS backend for CT Lead Finder built with [SST v3](https://sst.dev). Provides a REST API backed by DynamoDB and a Gmail webhook receiver for real-time reply detection.

## Architecture

```
Frontend (React) → API Gateway → Lambda → DynamoDB
Gmail reply      → Google Pub/Sub → API Gateway → Lambda → DynamoDB
```

## Stack

- **SST v3** — infrastructure as code (built on AWS CDK)
- **API Gateway v2** — HTTP API
- **Lambda** — serverless function handlers
- **DynamoDB** — outreach records storage
- **Google Pub/Sub** — Gmail push notifications for reply detection

## Project Structure

```
infra/
├── sst.config.ts         # AWS resource definitions (table, API, routes)
├── api/
│   ├── records/
│   │   ├── list.ts       # GET    /records
│   │   ├── create.ts     # POST   /records
│   │   ├── update.ts     # PUT    /records/{id}
│   │   └── delete.ts     # DELETE /records/{id}
│   └── webhook/
│       └── gmail.ts      # POST   /webhook/gmail (Pub/Sub receiver)
└── lib/
    ├── db.ts             # DynamoDB client + query helpers
    ├── gmail.ts          # Server-side Gmail API helpers
    └── types.ts          # Shared TypeScript types
```

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured
- AWS account with appropriate permissions
- [SST CLI](https://sst.dev/docs/reference/cli/) (`npm i -g sst` or use `npx sst`)

## AWS CLI Setup

If you haven't configured the AWS CLI yet:

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-1
# Default output format: json
```

Your AWS credentials can be found in the AWS Console under:
`IAM → Users → Your User → Security credentials → Access keys`

## Getting Started

```bash
cd infra
npm install

# Bootstrap SST in your AWS account (one-time)
npx sst init

# Start local dev (Lambdas run locally, connected to real AWS)
npm run dev

# Deploy to AWS (dev stage)
npm run deploy

# Deploy to production
npm run deploy:prod
```

## API Endpoints

| Method   | Path              | Description              |
|----------|-------------------|--------------------------|
| `GET`    | `/records`        | List all outreach records |
| `POST`   | `/records`        | Create a new record      |
| `PUT`    | `/records/{id}`   | Update a record          |
| `DELETE` | `/records/{id}`   | Delete a record          |
| `POST`   | `/webhook/gmail`  | Gmail Pub/Sub receiver   |

After deploying, SST outputs the API URL:
```
apiUrl: https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

Add this to your frontend `.env`:
```
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

## Environment Variables

No environment variables are needed in Lambda — SST automatically links the DynamoDB table and injects the table name via `Resource.OutreachRecords.name`.

For the Gmail webhook to fetch reply content, a stored OAuth refresh token will be needed (documented in the webhook setup section below).

## Gmail Webhook Setup

> Required for real-time reply detection.

1. **Create a Google Cloud Pub/Sub topic:**
   ```
   Google Cloud Console → Pub/Sub → Create topic → name: gmail-replies
   ```

2. **Grant Gmail publish rights to the topic:**
   ```
   Add principal: gmail-api-push@system.gserviceaccount.com
   Role: Pub/Sub Publisher
   ```

3. **Create a push subscription pointing to your API:**
   ```
   Subscription → Push → endpoint: https://your-api-url/webhook/gmail
   ```

4. **Set up Gmail watch** (call this from the frontend after OAuth):
   ```
   POST https://gmail.googleapis.com/gmail/v1/users/me/watch
   {
     "topicName": "projects/your-project/topics/gmail-replies",
     "labelIds": ["INBOX"]
   }
   ```
   The watch expires every 7 days and must be renewed.

## Stages

| Stage        | Command                  | AWS resources          |
|--------------|--------------------------|------------------------|
| `dev`        | `npm run dev`            | Removed on `sst remove` |
| `production` | `npm run deploy:prod`    | Retained on `sst remove` |

## Teardown

```bash
# Remove all AWS resources for the dev stage
npm run remove
```

> Production resources are protected and will not be deleted automatically.

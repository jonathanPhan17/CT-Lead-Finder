import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Stored as a special row in the same table — no outreach-record attributes
const TOKEN_PK = 'token';
const TOKEN_SK = 'gmail';

export interface StoredTokens {
  accessToken:    string;
  refreshToken?:  string;
  expiresAt:      number;   // unix ms — when the access token expires
  watchHistoryId?: string;  // last historyId seen — used as cursor for Gmail history API
  watchExpiry?:   number;   // unix ms — when the gmail.watch() subscription expires (7 days)
}

export async function storeTokens(patch: Partial<StoredTokens> & { accessToken: string }): Promise<void> {
  const existing = await getTokens();
  const merged: StoredTokens = { ...existing, ...patch } as StoredTokens;

  await client.send(new PutCommand({
    TableName: Resource.OutreachRecords.name,
    Item: { pk: TOKEN_PK, sk: TOKEN_SK, ...merged },
  }));
}

export async function getTokens(): Promise<StoredTokens | null> {
  const result = await client.send(new GetCommand({
    TableName: Resource.OutreachRecords.name,
    Key: { pk: TOKEN_PK, sk: TOKEN_SK },
  }));
  if (!result.Item) return null;
  const { pk: _pk, sk: _sk, ...tokens } = result.Item;
  return tokens as StoredTokens;
}

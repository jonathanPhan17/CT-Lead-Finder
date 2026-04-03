import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
import type { OutreachRecord, OutreachRecordPublic, OutreachStatus } from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const PK = 'default'; // single-tenant for now

function toPublic(record: OutreachRecord): OutreachRecordPublic {
  const { pk: _pk, sk: _sk, ...rest } = record;
  return rest;
}

// ── read ──────────────────────────────────────────────────────────────────────

export async function listRecords(): Promise<OutreachRecordPublic[]> {
  const result = await client.send(new QueryCommand({
    TableName: Resource.OutreachRecords.name,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': PK },
    ScanIndexForward: false, // newest first
  }));
  return (result.Items ?? []).map((item) => toPublic(item as OutreachRecord));
}

// ── write ─────────────────────────────────────────────────────────────────────

export async function createRecord(record: OutreachRecordPublic): Promise<void> {
  const item: OutreachRecord = { pk: PK, sk: record.id, ...record };
  await client.send(new PutCommand({
    TableName: Resource.OutreachRecords.name,
    Item: item,
  }));
}

// ── update ────────────────────────────────────────────────────────────────────

export async function updateRecord(
  id: string,
  patch: Partial<Pick<OutreachRecord, 'status' | 'notes' | 'replySubject' | 'replyBody' | 'replyReceivedAt'>>,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const sets = entries.map(([k], i) => `#f${i} = :v${i}`).join(', ');
  const names = Object.fromEntries(entries.map(([k], i) => [`#f${i}`, k]));
  const values = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]));

  await client.send(new UpdateCommand({
    TableName: Resource.OutreachRecords.name,
    Key: { pk: PK, sk: id },
    UpdateExpression: `SET ${sets}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// ── delete ────────────────────────────────────────────────────────────────────

export async function deleteRecord(id: string): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: Resource.OutreachRecords.name,
    Key: { pk: PK, sk: id },
  }));
}

// ── by status (for webhook — find no_reply records) ───────────────────────────

export async function listRecordsByStatus(status: OutreachStatus): Promise<OutreachRecordPublic[]> {
  const result = await client.send(new QueryCommand({
    TableName: Resource.OutreachRecords.name,
    IndexName: 'status-index',
    KeyConditionExpression: '#s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': status },
  }));
  return (result.Items ?? []).map((item) => toPublic(item as OutreachRecord));
}

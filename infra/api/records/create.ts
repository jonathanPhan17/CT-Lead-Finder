import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createRecord } from '../../lib/db';
import type { OutreachRecordPublic } from '../../lib/types';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const record = JSON.parse(event.body ?? '{}') as OutreachRecordPublic;
    if (!record.id || !record.contactEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: 'id and contactEmail are required' }) };
    }
    await createRecord(record);
    return { statusCode: 201, body: JSON.stringify(record) };
  } catch (err) {
    console.error('createRecord error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create record' }) };
  }
};

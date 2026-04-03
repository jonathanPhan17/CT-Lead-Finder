import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { updateRecord } from '../../lib/db';
import type { OutreachRecord } from '../../lib/types';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };

    const patch = JSON.parse(event.body ?? '{}') as Partial<
      Pick<OutreachRecord, 'status' | 'notes' | 'replySubject' | 'replyBody' | 'replyReceivedAt'>
    >;
    await updateRecord(id, patch);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('updateRecord error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update record' }) };
  }
};

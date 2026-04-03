import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { deleteRecord } from '../../lib/db';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const id = event.pathParameters?.id;
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };

    await deleteRecord(id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('deleteRecord error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete record' }) };
  }
};

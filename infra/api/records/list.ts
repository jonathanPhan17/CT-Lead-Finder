import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { listRecords } from '../../lib/db';

export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const records = await listRecords();
    return {
      statusCode: 200,
      body: JSON.stringify(records),
    };
  } catch (err) {
    console.error('listRecords error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch records' }) };
  }
};

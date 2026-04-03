import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { recordOpen } from '../../lib/db';

// 1×1 transparent GIF
const PIXEL_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const PIXEL_RESPONSE: APIGatewayProxyResultV2 = {
  statusCode: 200,
  headers: {
    'Content-Type':  'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma':        'no-cache',
  },
  body:            PIXEL_B64,
  isBase64Encoded: true,
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const id = event.pathParameters?.id;
  if (id) {
    // Fire-and-forget — don't let DB errors block the pixel response
    recordOpen(id).catch((err) => console.error('recordOpen failed', err));
  }
  return PIXEL_RESPONSE;
};

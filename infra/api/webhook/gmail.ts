import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { listRecordsByStatus, updateRecord } from '../../lib/db';
import { decodePubSubMessage, fetchReplyContent } from '../../lib/gmail';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const notification = decodePubSubMessage(body);

    // Always return 200 to Pub/Sub so it doesn't retry indefinitely
    if (!notification) {
      console.warn('Could not decode Pub/Sub message');
      return { statusCode: 200, body: '' };
    }

    const { emailAddress, historyId } = notification;
    console.log(`Gmail push: ${emailAddress}, historyId: ${historyId}`);

    // Get all no_reply records and check if this email matches one
    const noReplyRecords = await listRecordsByStatus('no_reply');
    const matched = noReplyRecords.find(
      (r) => r.contactEmail.toLowerCase() === emailAddress.toLowerCase(),
    );

    if (!matched) {
      console.log('No matching no_reply record for', emailAddress);
      return { statusCode: 200, body: '' };
    }

    // TODO: exchange historyId for a real access token via stored refresh token
    // For now log the match — full OAuth token storage comes in next step
    console.log(`Reply detected from ${emailAddress} for record ${matched.id}`);

    // When access token is available:
    // const reply = await fetchReplyContent(accessToken, messageId);
    // await updateRecord(matched.id, {
    //   status: 'replied',
    //   replySubject: reply?.subject,
    //   replyBody: reply?.body,
    //   replyReceivedAt: reply?.receivedAt,
    // });

    return { statusCode: 200, body: '' };
  } catch (err) {
    console.error('gmail webhook error', err);
    // Still return 200 — Pub/Sub will retry on non-2xx
    return { statusCode: 200, body: '' };
  }
};

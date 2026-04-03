import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { listRecordsByStatus, updateRecord } from '../../lib/db';
import { decodePubSubMessage, fetchReplyContent, getNewInboxMessageIds, getMessageSender, refreshAccessToken } from '../../lib/gmail';
import { getTokens, storeTokens } from '../../lib/tokens';

// Always return 200 to Pub/Sub — non-2xx causes retries
const OK: APIGatewayProxyResultV2 = { statusCode: 200, body: '' };

async function getValidAccessToken(): Promise<string | null> {
  const stored = await getTokens();
  if (!stored) return null;

  // Re-use if still valid (with 60s buffer)
  if (stored.expiresAt > Date.now() + 60_000) return stored.accessToken;

  // Refresh
  if (!stored.refreshToken) return null;
  const refreshed = await refreshAccessToken(stored.refreshToken);
  if (!refreshed) return null;

  await storeTokens({ ...stored, ...refreshed });
  return refreshed.accessToken;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const notification = decodePubSubMessage(body);

    if (!notification) {
      console.warn('Could not decode Pub/Sub message');
      return OK;
    }

    console.log(`Gmail push: emailAddress=${notification.emailAddress} historyId=${notification.historyId}`);

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.warn('No valid access token — user needs to reconnect Gmail');
      return OK;
    }

    // Get stored historyId cursor
    const stored = await getTokens();
    const startHistoryId = stored?.watchHistoryId ?? notification.historyId;

    // Fetch new INBOX messages since our last cursor
    const { messageIds, newHistoryId } = await getNewInboxMessageIds(accessToken, startHistoryId);

    // Advance the cursor so we don't re-process the same messages
    if (newHistoryId) {
      await storeTokens({ accessToken, watchHistoryId: newHistoryId });
    }

    if (messageIds.length === 0) return OK;

    // Load all no_reply records to match against
    const noReplyRecords = await listRecordsByStatus('no_reply');
    const emailIndex = new Map(noReplyRecords.map((r) => [r.contactEmail.toLowerCase(), r]));

    // For each new inbox message, check if sender is a known contact
    for (const messageId of messageIds) {
      const senderEmail = await getMessageSender(accessToken, messageId);
      if (!senderEmail) continue;

      const record = emailIndex.get(senderEmail);
      if (!record) continue;

      console.log(`Reply detected from ${senderEmail} → record ${record.id}`);

      // Fetch full reply content
      const reply = await fetchReplyContent(accessToken, messageId);

      await updateRecord(record.id, {
        status:          'replied',
        replySubject:    reply?.subject,
        replyBody:       reply?.body,
        replyReceivedAt: reply?.receivedAt ?? new Date().toISOString(),
      });

      console.log(`Record ${record.id} updated to replied`);
    }

    return OK;
  } catch (err) {
    console.error('gmail webhook error', err);
    return OK;
  }
};

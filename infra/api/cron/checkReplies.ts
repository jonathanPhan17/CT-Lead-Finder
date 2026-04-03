import { listRecordsByStatus, updateRecord } from '../../lib/db';
import { fetchReplyContent, refreshAccessToken, searchRepliesFromContacts } from '../../lib/gmail';
import { getTokens, storeTokens } from '../../lib/tokens';

async function getValidAccessToken(): Promise<string | null> {
  const stored = await getTokens();
  if (!stored) return null;

  // Re-use if still valid (with 60s buffer)
  if (stored.expiresAt > Date.now() + 60_000) return stored.accessToken;

  if (!stored.refreshToken) return null;
  const refreshed = await refreshAccessToken(stored.refreshToken);
  if (!refreshed) return null;

  await storeTokens({ ...stored, ...refreshed });
  return refreshed.accessToken;
}

export const handler = async (): Promise<void> => {
  console.log('checkReplies cron starting');

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.warn('No valid access token — user needs to connect Gmail');
    return;
  }

  // Get all records still waiting for a reply
  const noReplyRecords = await listRecordsByStatus('no_reply');
  if (noReplyRecords.length === 0) {
    console.log('No no_reply records — nothing to check');
    return;
  }

  console.log(`Checking ${noReplyRecords.length} no_reply records`);

  // Build a map of email → record for fast lookup
  const emailToRecord = new Map(
    noReplyRecords.map((r) => [r.contactEmail.toLowerCase(), r]),
  );

  // Search Gmail inbox for messages from any of these contacts
  const contactEmails = Array.from(emailToRecord.keys());
  const matches = await searchRepliesFromContacts(accessToken, contactEmails);

  if (matches.length === 0) {
    console.log('No replies found in inbox');
    return;
  }

  console.log(`Found ${matches.length} potential replies`);

  // For each match, fetch full reply content and update the record
  await Promise.all(
    matches.map(async ({ messageId, senderEmail }) => {
      const record = emailToRecord.get(senderEmail);
      if (!record) return;

      console.log(`Reply from ${senderEmail} → updating record ${record.id}`);

      const reply = await fetchReplyContent(accessToken, messageId);
      await updateRecord(record.id, {
        status:          'replied',
        replySubject:    reply?.subject,
        replyBody:       reply?.body,
        replyReceivedAt: reply?.receivedAt ?? new Date().toISOString(),
      });
    }),
  );

  console.log('checkReplies cron done');
};
